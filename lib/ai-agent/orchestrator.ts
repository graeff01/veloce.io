import { prisma } from "@/lib/prisma";
import { openaiChat, embed, cosine, type ChatMessage, type ChatResult, type ToolDef } from "@/lib/openai";
import { TOOL_DEFS, executeTool, type ToolCtx } from "./tools";
import { checkReply, resolveBlockRules } from "./guardrail";
import { Prisma } from "@prisma/client";

interface RunInput {
  clientId: string;
  connectionId: string;
  contact: { id: string; name: string | null; waId: string };
  inboundText: string;
  idempotencyKey?: string; // ex: waMessageId — dedupe p/ a fila durável futura
  inboundMediaType?: string; // text|audio|image|document|... (proveniência)
}

interface RunOpts {
  mode?: "live" | "test";
  transcript?: ChatMessage[]; // memória efêmera (apenas no modo test)
}

export interface RunOutput {
  reply: string | null;
  status: "ok" | "blocked" | "error" | "skipped";
  decision: string;
  toolCalls?: { name: string; args: unknown; result: string }[]; // exposto p/ o console
}

// Subconjunto estrutural usado para montar o prompt — AiAgentConfig satisfaz isto.
interface PromptCfg { language: string; persona: string | null; goals: string | null; rules: string | null; timezone: string }

// Versão do contrato de prompt/tools/guardrail. Incremente ao mudar o comportamento —
// permite comparar respostas entre versões (rastreabilidade).
const PROMPT_VERSION = "2026-06-08.2";
const MAX_TURNS = Number(process.env.AI_AGENT_MAX_TURNS || 40);
const DEFAULT_FALLBACK = "Sobre isso, quem te ajuda melhor é um vendedor — já registrei aqui pra ele te dar os detalhes. 😊";
const DISCLOSURE = "🤖 Atendimento automático (fora do horário). Posso tirar dúvidas e agendar sua visita — e a qualquer momento chamo um vendedor, tá?";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chatWithRetry(opts: { model: string; messages: ChatMessage[]; tools: ToolDef[] }): Promise<ChatResult> {
  let lastErr: unknown;
  for (let a = 0; a < 3; a++) {
    try { return await openaiChat(opts); }
    catch (e) { lastErr = e; await sleep(400 * (a + 1)); }
  }
  throw lastErr;
}

const disclose = (text: string, isFirst: boolean) => (isFirst ? `${DISCLOSURE}\n\n${text}` : text);

function buildSystemPrompt(cfg: PromptCfg, perfil: string, knowledge: string): string {
  return [
    `Você é o atendente virtual de uma loja, atendendo leads pelo WhatsApp FORA do horário comercial. Idioma: ${cfg.language}. Tom: ${cfg.persona || "cordial, objetivo e humano"}.`,
    cfg.goals
      ? `OBJETIVO: ${cfg.goals}`
      : `OBJETIVO: entender a necessidade do lead, tirar dúvidas permitidas, qualificar e — quando fizer sentido — agendar uma visita à loja.`,
    `REGRAS ABSOLUTAS:
- NUNCA negocie, dê desconto, simule parcelas, aprove financiamento, avalie troca ou faça promessas. Se pedirem, diga que um vendedor cuida disso e use a ferramenta escalar_humano.
- NUNCA invente informação. Preço e estoque SÓ via ferramenta buscar_estoque. Sem fonte, diga que vai confirmar com um vendedor (escalar_humano).
- Na dúvida, prefira escalar_humano a arriscar uma resposta sem base.
- Toda visita pertence à LOJA, nunca a um vendedor específico.
- Use consultar_disponibilidade antes de oferecer horários; só marque com marcar_visita usando horários livres retornados.
- Sempre avise que a disponibilidade do produto será confirmada na visita.
- Registre o que descobrir do lead com atualizar_perfil.
- MÍDIA: áudios já chegam transcritos (trate como texto normal). Mensagens entre colchetes como "[O lead enviou uma imagem/documento/...]" indicam mídia que você NÃO pode analisar — reconheça que recebeu, NÃO extraia dados nem avalie nada (ex: não estime troca por foto, não leia documentos), e ofereça seguir por texto ou que um vendedor verá no atendimento.
- Mensagens curtas e naturais, como no WhatsApp.`,
    cfg.rules ? `REGRAS DO CLIENTE:\n${cfg.rules}` : "",
    knowledge ? `CONHECIMENTO (única fonte para políticas/FAQ — não vá além disto):\n${knowledge}` : "",
    perfil ? `PERFIL DO LEAD: ${perfil}` : "",
    `Agora: ${new Date().toLocaleString("pt-BR", { timeZone: cfg.timezone || "America/Sao_Paulo" })}.`,
  ].filter(Boolean).join("\n\n");
}

// Único motor. mode="live": envia/grava/agenda de verdade. mode="test": mesmo prompt,
// tools, guardrail, RAG e fluxo — apenas responde, sem gravar nada (memória efêmera).
export async function runAgent(input: RunInput, opts: RunOpts = {}): Promise<RunOutput> {
  const mode = opts.mode ?? "live";
  const start = Date.now();
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: input.clientId } });
  if (mode === "live" && (!cfg || !cfg.enabled)) return { reply: null, status: "skipped", decision: "desligado" };

  const model = cfg?.model ?? "gpt-4o-mini";
  const fallback = cfg?.fallbackMessage || DEFAULT_FALLBACK;
  const handoffAfter = cfg?.handoffAfter ?? 0;
  const promptCfg: PromptCfg = {
    language: cfg?.language ?? "pt-BR", persona: cfg?.persona ?? null, goals: cfg?.goals ?? null,
    rules: cfg?.rules ?? null, timezone: cfg?.timezone ?? "America/Sao_Paulo",
  };

  const log = (fields: { outbound: string | null; decision: string; status: RunOutput["status"]; tokensIn?: number; tokensOut?: number; toolCalls?: unknown[]; contextUsed?: unknown }) =>
    prisma.aiInteraction.create({ data: {
      clientId: input.clientId, contactId: input.contact.id, inbound: input.inboundText,
      outbound: fields.outbound, toolCalls: fields.toolCalls?.length ? (fields.toolCalls as unknown as Prisma.InputJsonValue) : undefined,
      decision: fields.decision, model, tokensIn: fields.tokensIn ?? 0, tokensOut: fields.tokensOut ?? 0,
      latencyMs: Date.now() - start, status: fields.status,
      promptVersion: PROMPT_VERSION, idempotencyKey: input.idempotencyKey ?? undefined,
      inboundMediaType: input.inboundMediaType ?? undefined,
      contextUsed: fields.contextUsed ? (fields.contextUsed as Prisma.InputJsonValue) : undefined,
    } }).catch(() => {});

  // Memória: live lê do banco; test usa o transcript efêmero. Mesmo mecanismo, fonte distinta.
  const turns = mode === "live"
    ? await prisma.aiInteraction.count({ where: { clientId: input.clientId, contactId: input.contact.id } })
    : (opts.transcript ?? []).filter((m) => m.role === "assistant").length;
  const isFirst = turns === 0;

  // Teto de custo por contato (só produção).
  if (mode === "live" && turns >= MAX_TURNS) {
    await log({ outbound: null, decision: "limite", status: "skipped" });
    return { reply: null, status: "skipped", decision: "limite" };
  }

  // Escalonamento por regra (só produção — depende do histórico de decisões).
  if (mode === "live" && handoffAfter > 0) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const unresolved = await prisma.aiInteraction.count({ where: { clientId: input.clientId, contactId: input.contact.id, createdAt: { gte: since }, decision: { notIn: ["agendou", "escalou", "limite"] } } });
    if (unresolved >= handoffAfter) {
      const reply = disclose(fallback, isFirst);
      await log({ outbound: reply, decision: "escalou", status: "ok" });
      return { reply, status: "ok", decision: "escalou" };
    }
  }

  let perfil = "";
  let priorMessages: ChatMessage[];
  if (mode === "live") {
    const profile = await prisma.leadProfile.findUnique({ where: { contactId: input.contact.id } });
    perfil = profile
      ? [
          profile.productInterest && `interesse: ${profile.productInterest}`,
          profile.budget && `orçamento: ${profile.budget}`,
          profile.wantsFinancing != null && `financiamento: ${profile.wantsFinancing ? "sim" : "não"}`,
          profile.hasTradeIn != null && `troca: ${profile.hasTradeIn ? "sim" : "não"}`,
        ].filter(Boolean).join("; ")
      : "";
    const history = await prisma.waMessage.findMany({
      where: { contactId: input.contact.id }, orderBy: { timestamp: "desc" }, take: 14, select: { direction: true, text: true },
    });
    priorMessages = [...history].reverse().filter((m) => m.text).map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.text } as ChatMessage));
  } else {
    priorMessages = opts.transcript ?? [];
  }

  // RAG: igual nos dois modos (lê o conhecimento real do cliente).
  let knowledge = "";
  let contextUsed: unknown = undefined;
  try {
    const chunks = await prisma.knowledgeChunk.findMany({ where: { clientId: input.clientId }, take: 300 });
    if (chunks.length) {
      const [q] = await embed([input.inboundText]);
      const ranked = chunks.map((c) => ({ c, s: cosine(q, c.embedding) })).sort((a, b) => b.s - a.s).slice(0, 3).filter((x) => x.s > 0.2);
      if (ranked.length) {
        knowledge = ranked.map((r) => `- ${r.c.title ? `${r.c.title}: ` : ""}${r.c.content}`).join("\n");
        // Rastreabilidade: registra QUAIS trechos embasaram a resposta.
        contextUsed = { chunks: ranked.map((r) => ({ id: r.c.id, title: r.c.title, score: Number(r.s.toFixed(3)) })) };
      }
    }
  } catch { /* conhecimento é opcional */ }

  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(promptCfg, perfil, knowledge) }, ...priorMessages];

  const ctx: ToolCtx = {
    clientId: input.clientId, connectionId: input.connectionId,
    contactId: input.contact.id, contactName: input.contact.name, contactWaId: input.contact.waId, mode,
  };

  let decision = "respondeu_duvida";
  let tokensIn = 0, tokensOut = 0;
  const toolLog: { name: string; args: unknown; result: string }[] = [];
  let final: string | null = null;
  let status: RunOutput["status"] = "ok";

  try {
    for (let i = 0; i < 5; i++) {
      const { message, usage } = await chatWithRetry({ model, messages, tools: TOOL_DEFS });
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
  } catch {
    final = fallback; status = "error"; decision = "erro";
  }

  if (!final || !final.trim()) { final = fallback; if (decision === "respondeu_duvida") decision = "sem_fonte"; }

  // Guardrail desacoplado por vertical (padrão do segmento ou override do tenant).
  const blockRules = resolveBlockRules(cfg?.vertical ?? "automotivo", (cfg?.blockedTopics as { pattern: string; reason: string }[] | null) ?? null);
  const g = checkReply(final, blockRules);
  if (!g.allowed) { final = fallback; status = "blocked"; decision = "bloqueado"; }

  final = disclose(final, isFirst);

  if (mode === "live") await log({ outbound: final, decision, status, tokensIn, tokensOut, toolCalls: toolLog, contextUsed });
  return { reply: final, status, decision, toolCalls: toolLog };
}
