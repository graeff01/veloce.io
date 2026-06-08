import { prisma } from "@/lib/prisma";
import { openaiChat, embed, cosine, type ChatMessage } from "@/lib/openai";
import { TOOL_DEFS, executeTool, type ToolCtx } from "./tools";
import { checkReply } from "./guardrail";
import { Prisma, type AiAgentConfig, type LeadProfile } from "@prisma/client";

interface RunInput {
  clientId: string;
  connectionId: string;
  contact: { id: string; name: string | null; waId: string };
  inboundText: string;
}

export interface RunOutput { reply: string | null; status: "ok" | "blocked" | "error" | "skipped"; decision: string }

function buildSystemPrompt(cfg: AiAgentConfig, profile: LeadProfile | null, knowledge: string): string {
  const perfil = profile
    ? [
        profile.productInterest && `interesse: ${profile.productInterest}`,
        profile.budget && `orçamento: ${profile.budget}`,
        profile.wantsFinancing != null && `financiamento: ${profile.wantsFinancing ? "sim" : "não"}`,
        profile.hasTradeIn != null && `troca: ${profile.hasTradeIn ? "sim" : "não"}`,
      ].filter(Boolean).join("; ")
    : "";

  return [
    `Você é o atendente virtual de uma loja, atendendo leads pelo WhatsApp FORA do horário comercial. Idioma: ${cfg.language}. Tom: ${cfg.persona || "cordial, objetivo e humano"}.`,
    cfg.goals
      ? `OBJETIVO: ${cfg.goals}`
      : `OBJETIVO: entender a necessidade do lead, tirar dúvidas permitidas, qualificar e — quando fizer sentido — agendar uma visita à loja.`,
    `REGRAS ABSOLUTAS:
- NUNCA negocie, dê desconto, simule parcelas, aprove financiamento, avalie troca ou faça promessas. Se pedirem, diga que um vendedor cuida disso e use a ferramenta escalar_humano.
- NUNCA invente informação. Preço e estoque SÓ via ferramenta buscar_estoque. Sem fonte, diga que vai confirmar com um vendedor.
- Toda visita pertence à LOJA, nunca a um vendedor específico.
- Use consultar_disponibilidade antes de oferecer horários; só marque com marcar_visita usando horários livres retornados.
- Sempre avise que a disponibilidade do produto será confirmada na visita.
- Registre o que descobrir do lead com atualizar_perfil.
- Mensagens curtas e naturais, como no WhatsApp.`,
    cfg.rules ? `REGRAS DO CLIENTE:\n${cfg.rules}` : "",
    knowledge ? `CONHECIMENTO (única fonte para políticas/FAQ — não vá além disto):\n${knowledge}` : "",
    perfil ? `PERFIL DO LEAD: ${perfil}` : "",
    `Agora: ${new Date().toLocaleString("pt-BR")}.`,
  ].filter(Boolean).join("\n\n");
}

export async function runAgent(input: RunInput): Promise<RunOutput> {
  const start = Date.now();
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: input.clientId } });
  if (!cfg || !cfg.enabled) return { reply: null, status: "skipped", decision: "desligado" };

  const profile = await prisma.leadProfile.findUnique({ where: { contactId: input.contact.id } });
  const history = await prisma.waMessage.findMany({
    where: { contactId: input.contact.id },
    orderBy: { timestamp: "desc" }, take: 14, select: { direction: true, text: true },
  });

  // RAG: recupera trechos do conhecimento mais próximos da pergunta.
  let knowledge = "";
  try {
    const chunks = await prisma.knowledgeChunk.findMany({ where: { clientId: input.clientId }, take: 300 });
    if (chunks.length) {
      const [q] = await embed([input.inboundText]);
      const ranked = chunks
        .map((c) => ({ c, s: cosine(q, c.embedding) }))
        .sort((a, b) => b.s - a.s).slice(0, 3).filter((x) => x.s > 0.2);
      if (ranked.length) knowledge = ranked.map((r) => `- ${r.c.title ? `${r.c.title}: ` : ""}${r.c.content}`).join("\n");
    }
  } catch { /* conhecimento é opcional */ }

  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(cfg, profile, knowledge) }];
  for (const m of [...history].reverse()) {
    if (!m.text) continue;
    messages.push({ role: m.direction === "in" ? "user" : "assistant", content: m.text });
  }

  const ctx: ToolCtx = {
    clientId: input.clientId, connectionId: input.connectionId,
    contactId: input.contact.id, contactName: input.contact.name, contactWaId: input.contact.waId,
  };

  let decision = "respondeu_duvida";
  let tokensIn = 0, tokensOut = 0;
  const toolLog: { name: string; args: unknown; result: string }[] = [];
  let final: string | null = null;
  let status: RunOutput["status"] = "ok";

  try {
    for (let i = 0; i < 5; i++) {
      const { message, usage } = await openaiChat({ model: cfg.model, messages, tools: TOOL_DEFS });
      tokensIn += usage.prompt_tokens; tokensOut += usage.completion_tokens;

      if (message.tool_calls?.length) {
        messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
        for (const tc of message.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* args vazios */ }
          const r = await executeTool(tc.function.name, args, ctx);
          if (r.decision) decision = r.decision;
          toolLog.push({ name: tc.function.name, args, result: r.result });
          messages.push({ role: "tool", tool_call_id: tc.id, content: r.result });
        }
        continue;
      }
      final = message.content ?? null;
      break;
    }
  } catch (e) {
    status = "error";
    await prisma.aiInteraction.create({ data: {
      clientId: input.clientId, contactId: input.contact.id, inbound: input.inboundText,
      outbound: null, decision: "erro", model: cfg.model, tokensIn, tokensOut,
      latencyMs: Date.now() - start, status: "error",
    } }).catch(() => {});
    void e;
    return { reply: null, status, decision: "erro" };
  }

  if (final) {
    const g = checkReply(final);
    if (!g.allowed) {
      final = cfg.fallbackMessage || "Sobre valores e condições, quem te ajuda melhor é um vendedor — já registrei aqui pra ele te dar todos os detalhes. 😊";
      status = "blocked"; decision = "bloqueado";
    }
  }

  await prisma.aiInteraction.create({ data: {
    clientId: input.clientId, contactId: input.contact.id, inbound: input.inboundText,
    outbound: final, toolCalls: toolLog.length ? (toolLog as unknown as Prisma.InputJsonValue) : undefined, decision, model: cfg.model,
    tokensIn, tokensOut, latencyMs: Date.now() - start, status,
  } }).catch(() => {});

  return { reply: final, status, decision };
}
