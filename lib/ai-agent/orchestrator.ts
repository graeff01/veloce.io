import { prisma } from "@/lib/prisma";
import { openaiChat, type ChatMessage, type ChatResult, type ToolDef } from "@/lib/openai";
import { retrieveKnowledge } from "./retrieval";
import { toolsForConfig, executeTool, type ToolCtx } from "./tools";
import { checkReply, resolveBlockRules } from "./guardrail";
import { inspectInput, INJECTION_HARDENING } from "./input-guard";
import { checkGrounding } from "./grounding";
import { verifyReply } from "./verify";
import { parseSpec } from "./intake";
import { describeRules, type PricingRules } from "./pricing";
import { recallMemories, formatMemories } from "./memory";
import { detectSentiment, sentimentHint } from "./humanize";
import { Prisma } from "@prisma/client";

interface RunInput {
  clientId: string;
  connectionId: string;
  contact: { id: string; name: string | null; waId: string };
  inboundText: string;
  idempotencyKey?: string; // ex: waMessageId — dedupe p/ a fila durável futura
  inboundMediaType?: string; // text|audio|image|document|... (proveniência)
  inboundImages?: string[]; // F3 (vision): imagens do lead como data URI (quando visionEnabled)
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
interface PromptCfg { language: string; persona: string | null; goals: string | null; rules: string | null; timezone: string; alwaysOn: boolean; visionEnabled: boolean }

// Versão do contrato de prompt/tools/guardrail. Incremente ao mudar o comportamento —
// permite comparar respostas entre versões (rastreabilidade).
const PROMPT_VERSION = "2026-06-08.2";
const MAX_TURNS = Number(process.env.AI_AGENT_MAX_TURNS || 40);
const DEFAULT_FALLBACK = "Sobre isso, quem te ajuda melhor é um vendedor — já registrei aqui pra ele te dar os detalhes. 😊";
const DISCLOSURE_OFFHOURS = "🤖 Atendimento automático (fora do horário). Posso tirar dúvidas e agendar sua visita — e a qualquer momento chamo um vendedor, tá?";
const DISCLOSURE_ALWAYSON = "🤖 Atendimento automático. Posso tirar suas dúvidas e adiantar tudo por aqui — e a qualquer momento chamo um vendedor, tá?";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chatWithRetry(opts: { model: string; messages: ChatMessage[]; tools: ToolDef[] }): Promise<ChatResult> {
  let lastErr: unknown;
  for (let a = 0; a < 3; a++) {
    try { return await openaiChat(opts); }
    catch (e) { lastErr = e; await sleep(400 * (a + 1)); }
  }
  throw lastErr;
}

const disclose = (text: string, isFirst: boolean, disclosure: string) => (isFirst ? `${disclosure}\n\n${text}` : text);

function buildSystemPrompt(cfg: PromptCfg, perfil: string, knowledge: string): string {
  const contexto = cfg.alwaysOn
    ? "atendendo leads pelo WhatsApp como primeira linha de atendimento"
    : "atendendo leads pelo WhatsApp FORA do horário comercial";
  return [
    `Você é o atendente virtual de uma loja, ${contexto}. Idioma: ${cfg.language}. Tom: ${cfg.persona || "cordial, objetivo e humano"}.`,
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
- MÍDIA: áudios já chegam transcritos (trate como texto normal). ${cfg.visionEnabled
      ? "IMAGENS enviadas pelo lead você PODE analisar (a imagem vem anexada) — descreva/aproveite o que dá para ver com honestidade, mas NÃO invente o que não está visível nem faça avaliação técnica/valor sem base; na dúvida, ofereça que um vendedor confirme. Documentos entre colchetes você NÃO analisa."
      : "Mensagens entre colchetes como \"[O lead enviou uma imagem/documento/...]\" indicam mídia que você NÃO pode analisar — reconheça que recebeu, NÃO extraia dados nem avalie nada (ex: não estime troca por foto, não leia documentos), e ofereça seguir por texto ou que um vendedor verá no atendimento."}
- Mensagens curtas e naturais, como no WhatsApp.`,
    cfg.rules ? `REGRAS DO CLIENTE:\n${cfg.rules}` : "",
    knowledge ? `CONHECIMENTO (única fonte para políticas/FAQ — não vá além disto):\n${knowledge}` : "",
    perfil ? `PERFIL DO LEAD: ${perfil}` : "",
    `Agora: ${new Date().toLocaleString("pt-BR", { timeZone: cfg.timezone || "America/Sao_Paulo" })}.`,
  ].filter(Boolean).join("\n\n");
}

// F2: bloco de orientação de ficha + orçamento (anexado ao system prompt quando
// habilitado). Informa os campos a coletar e o catálogo de preços (chaves válidas),
// e crava o fluxo — o preço só sai da ferramenta gerar_orcamento.
async function buildQuoteGuidance(clientId: string, quotesEnabled: boolean, intakeSpec: unknown): Promise<string> {
  const parts: string[] = ["\n\n── ATENDIMENTO COM ORÇAMENTO ──"];

  const spec = parseSpec(intakeSpec);
  if (spec.length) {
    const campos = spec.map((f) => `- ${f.key}: ${f.label}${f.required ? " (obrigatório)" : ""}${f.options ? ` [opções: ${f.options.join(", ")}]` : ""}`).join("\n");
    parts.push(`FICHA A COLETAR (use atualizar_ficha ao descobrir cada dado):\n${campos}`);
  }

  if (quotesEnabled) {
    try {
      const pc = await prisma.pricingConfig.findUnique({ where: { clientId } });
      if (pc) {
        const cat = describeRules(pc.rules as unknown as PricingRules);
        if (cat) parts.push(`CATÁLOGO DE PREÇOS (use SOMENTE estas chaves em gerar_orcamento):\n${cat}`);
      }
    } catch { /* catálogo é opcional */ }
    parts.push(
      "FLUXO: 1) colete a ficha; 2) com os dados, chame gerar_orcamento usando as chaves EXATAS do catálogo; " +
      "3) apresente o orçamento e confirme com o lead; 4) se ele confirmar, use enviar_orcamento (envia o PDF); " +
      "5) SÓ quando o lead aprovar/quiser comprar, use aprovar_orcamento (passa a um vendedor). " +
      "NUNCA diga preço, total ou desconto fora do resultado de gerar_orcamento. Na dúvida sobre valor, gere o orçamento ou escale.",
    );
  }

  return parts.join("\n\n");
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
    rules: cfg?.rules ?? null, timezone: cfg?.timezone ?? "America/Sao_Paulo", alwaysOn: cfg?.alwaysOn ?? false,
    visionEnabled: cfg?.visionEnabled ?? false,
  };
  const disclosure = promptCfg.alwaysOn ? DISCLOSURE_ALWAYSON : DISCLOSURE_OFFHOURS;

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
      const reply = disclose(fallback, isFirst, disclosure);
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

  // Auditoria da resposta (rastreabilidade): RAG usado, guardrail de entrada,
  // grounding e verificação. Vai para AiInteraction.contextUsed.
  const audit: Record<string, unknown> = {};

  // RAG afinado (rerank + MMR): igual nos dois modos (lê o conhecimento real do cliente).
  let knowledge = "";
  try {
    const { chunks, used } = await retrieveKnowledge(input.clientId, input.inboundText);
    if (chunks.length) {
      knowledge = chunks.map((c) => `- ${c.title ? `${c.title}: ` : ""}${c.content}`).join("\n");
      // Rastreabilidade: registra QUAIS trechos embasaram a resposta.
      audit.chunks = used;
    }
  } catch { /* conhecimento é opcional */ }

  // Guardrail de ENTRADA (pré-LLM): injeção de prompt + PII. Não bloqueia o lead;
  // reforça a defesa no system prompt e registra o flag (PII mascarada nos logs).
  const guardIn = inspectInput(input.inboundText);
  if (guardIn.flags.length) audit.inputGuard = guardIn.flags;
  let systemPrompt = buildSystemPrompt(promptCfg, perfil, knowledge);
  if (guardIn.injection) systemPrompt += `\n\n${INJECTION_HARDENING}`;

  // F3: naturalidade — ajusta o tom pelo sentimento do lead e reforça estilo humano.
  if (cfg?.humanize) {
    const sent = detectSentiment(input.inboundText);
    const hint = sentimentHint(sent);
    systemPrompt += `\n\nESTILO: escreva como no WhatsApp — mensagens curtas e naturais, use contrações (tá, pra, cê), varie as frases (não repita respostas prontas).${hint ? ` ${hint}` : ""}`;
    if (sent !== "neutro") audit.sentiment = sent;
  }

  // F3: memória de longo prazo — traz fatos de conversas anteriores (quando habilitado).
  if (cfg?.memoryEnabled) {
    try {
      const mtxt = formatMemories(await recallMemories(input.clientId, input.contact.id, input.inboundText));
      if (mtxt) { systemPrompt += `\n\n${mtxt}`; audit.memory = true; }
    } catch { /* memória é opcional */ }
  }

  // F2: orientação de ficha/orçamento (só quando habilitado) — informa os campos a
  // coletar, o catálogo de preços (chaves válidas) e o fluxo. Preço só via ferramenta.
  const intakeSpec = cfg?.intakeSpec;
  if (cfg?.quotesEnabled || (Array.isArray(intakeSpec) && intakeSpec.length)) {
    systemPrompt += await buildQuoteGuidance(input.clientId, cfg?.quotesEnabled ?? false, intakeSpec);
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...priorMessages];

  // F3 (vision): anexa a(s) imagem(ns) do lead ao último turno do usuário (multimodal).
  if (input.inboundImages?.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const txt = typeof messages[i].content === "string" ? (messages[i].content as string) : "";
        messages[i] = { role: "user", content: [
          { type: "text", text: txt || "[o lead enviou uma imagem]" },
          ...input.inboundImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ] };
        break;
      }
    }
    audit.vision = input.inboundImages.length;
  }

  const tools = toolsForConfig(cfg);

  const ctx: ToolCtx = {
    clientId: input.clientId, connectionId: input.connectionId,
    contactId: input.contact.id, contactName: input.contact.name, contactWaId: input.contact.waId, mode,
    intakeSpec,
  };

  let decision = "respondeu_duvida";
  let tokensIn = 0, tokensOut = 0;
  const toolLog: { name: string; args: unknown; result: string }[] = [];
  let final: string | null = null;
  let status: RunOutput["status"] = "ok";

  try {
    for (let i = 0; i < 5; i++) {
      const { message, usage } = await chatWithRetry({ model, messages, tools });
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

  // ── F1: grounding — preço/prazo precisa ter fonte, senão a IA abstém ──────────
  // Fontes legítimas: resultados de ferramentas + conhecimento (RAG) + a conversa
  // (inclui o eco do próprio lead, para não marcar falso positivo).
  const toolText = toolLog.map((t) => t.result).join("\n");
  const convText = [input.inboundText, ...priorMessages.map((m) => (typeof m.content === "string" ? m.content : ""))].join("\n");
  const sources = [toolText, knowledge, convText].filter(Boolean).join("\n");

  if (status === "ok") {
    const gr = checkGrounding(final, sources);
    const enforce = cfg?.groundingEnforce ?? false;
    if (gr.priceViolations.length || gr.deadlineWarnings.length) {
      // Registra sempre (rastreabilidade). "enforced" indica se chegou a agir.
      audit.grounding = { priceViolations: gr.priceViolations, deadlineWarnings: gr.deadlineWarnings, enforced: enforce && !gr.grounded };
    }
    // Modo MONITOR por padrão: só ABSTÉM quando o cliente liga a fiscalização
    // (groundingEnforce). Assim o rollout não altera o comportamento ao vivo — o
    // painel mostra quando abstiria, e você liga a fiscalização após validar.
    if (!gr.grounded && enforce) { final = fallback; decision = "abster"; }
  }

  // ── F1: chain-of-verification por LLM (opt-in por cliente) ───────────────────
  if (status === "ok" && decision !== "abster" && cfg?.verifyReplies) {
    const v = await verifyReply({ model, sources, reply: final });
    if (!v.ok) { audit.verify = { unsupported: v.unsupported }; final = fallback; decision = "abster"; }
  }

  // Guardrail desacoplado por vertical (padrão do segmento ou override do tenant).
  const blockRules = resolveBlockRules(cfg?.vertical ?? "automotivo", (cfg?.blockedTopics as { pattern: string; reason: string }[] | null) ?? null);
  const g = checkReply(final, blockRules);
  if (!g.allowed) { final = fallback; status = "blocked"; decision = "bloqueado"; }

  final = disclose(final, isFirst, disclosure);

  if (mode === "live") await log({ outbound: final, decision, status, tokensIn, tokensOut, toolCalls: toolLog, contextUsed: Object.keys(audit).length ? audit : undefined });
  return { reply: final, status, decision, toolCalls: toolLog };
}
