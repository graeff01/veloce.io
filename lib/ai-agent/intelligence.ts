import { prismaUnscoped } from "@/lib/prisma";
import { openaiChat } from "@/lib/openai";

// ── Sprint 3: Intelligence Layer ───────────────────────────────────────────────
// Classifica CADA mensagem relevante do lead em intent + sentiment + objeção, de
// forma ASSÍNCRONA (pós-envio), com gate anti-overclassification. Persiste em tabelas
// (analytics > JSON). Funções de taxonomia/gate/parse são puras e testáveis.

export const INTENTS = [
  "GENERAL_INQUIRY", "PRICE_QUESTION", "PRICE_NEGOTIATION", "FINANCING_QUESTION",
  "TRADE_IN", "VISIT_INTENT", "BUYING_SIGNAL", "HESITATION", "COMPARISON",
  "OBJECTION", "READY_TO_CLOSE", "DROP_RISK", "FOLLOW_UP_REQUEST",
] as const;
export const SENTIMENTS = [
  "COLD", "WARM", "HOT", "EXCITED", "FRUSTRATED", "CONFUSED", "SKEPTICAL", "ANGRY", "IMPATIENT",
] as const;
export const OBJECTIONS = [
  "PRICE", "TRUST", "FINANCING", "TIMING", "COMPETITOR", "FIT", "AUTHORITY", "URGENCY", "LOCATION", "OTHER",
] as const;

export type Intent = (typeof INTENTS)[number];
export type Sentiment = (typeof SENTIMENTS)[number];
export type Objection = (typeof OBJECTIONS)[number];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Gate anti-overclassification: ignora mensagens triviais/curtas (ok, kkk, 👍...).
export function isAnalyzable(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = norm(text);
  if (t.replace(/[^a-z0-9]/g, "").length < 3) return false;
  if (/^(ok+|okay|blz|beleza|entendi+|entendido|kk+|ks+|rs+|haha+|valeu|vlw|obrigad[oa]|brigad[oa]|sim|nao|certo|isso|isso ai|uhum|aham|tendi|show|otimo|otima|perfeito|combinado|fechado|ta bom|tá bom|tabom)[\s!.]*$/.test(t)) return false;
  return true;
}

export interface Analysis {
  intent: Intent | null;
  intentConfidence: number;
  sentiment: Sentiment | null;
  sentimentConfidence: number;
  objection: Objection | null;
  objectionSeverity: number;
}

const clamp01 = (n: unknown) => { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; };
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => {
  if (typeof v !== "string") return null;
  const up = v.toUpperCase().trim();
  return (allowed as readonly string[]).includes(up) ? (up as T) : null;
};

// Normaliza/valida a saída do LLM contra a taxonomia (nunca confia em texto livre).
export function parseAnalysis(raw: string): Analysis | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch { return null; }
  const intent = pick(o.intent, INTENTS);
  const sentiment = pick(o.sentiment, SENTIMENTS);
  const objection = pick(o.objection, OBJECTIONS);
  if (!intent && !sentiment && !objection) return null;
  return {
    intent, intentConfidence: clamp01(o.intentConfidence ?? o.confidence),
    sentiment, sentimentConfidence: clamp01(o.sentimentConfidence ?? o.confidence),
    objection, objectionSeverity: objection ? clamp01(o.objectionSeverity ?? o.severity ?? 0.6) : 0,
  };
}

// Regra explícita e auditável de RESOLUÇÃO de objeção: sinais de avanço encerram as
// objeções abertas do lead (ouro analítico = "objeção foi superada").
export function resolvesObjections(intent: Intent | null, sentiment: Sentiment | null): boolean {
  return (
    (intent != null && ["BUYING_SIGNAL", "READY_TO_CLOSE", "VISIT_INTENT", "FOLLOW_UP_REQUEST"].includes(intent)) ||
    (sentiment != null && ["EXCITED", "HOT"].includes(sentiment))
  );
}

const MODEL = process.env.AI_INTEL_MODEL || "gpt-4o-mini";
const SYSTEM =
  `Você classifica UMA mensagem de um lead de loja de veículos no WhatsApp.\n` +
  `Responda APENAS JSON: {"intent","intentConfidence","sentiment","sentimentConfidence","objection","objectionSeverity"}.\n` +
  `intent ∈ [${INTENTS.join(", ")}].\n` +
  `sentiment ∈ [${SENTIMENTS.join(", ")}].\n` +
  `objection ∈ [${OBJECTIONS.join(", ")}] ou null se não houver objeção.\n` +
  `confidences e severity entre 0 e 1. Se a mensagem for trivial, use intent=null.`;

// Pipeline assíncrono: classifica e persiste. Best-effort — nunca lança.
export async function analyzeMessage(p: {
  clientId: string; connectionId: string; contactId: string; waMessageId: string; text: string;
}): Promise<void> {
  if (!isAnalyzable(p.text)) return;
  // Idempotência: já analisada?
  const exists = await prismaUnscoped.messageAnalysis.findUnique({ where: { waMessageId: p.waMessageId }, select: { id: true } }).catch(() => null);
  if (exists) return;

  let analysis: Analysis | null = null;
  try {
    const { message } = await openaiChat({
      model: MODEL, temperature: 0, maxTokens: 120,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: p.text.slice(0, 1000) }],
      meta: { clientId: p.clientId, pipeline: "intelligence", tenantKey: p.clientId },
    });
    analysis = parseAnalysis(message.content || "");
  } catch { return; }
  if (!analysis) return;

  await prismaUnscoped.messageAnalysis.create({
    data: {
      clientId: p.clientId, connectionId: p.connectionId, contactId: p.contactId, waMessageId: p.waMessageId,
      intent: analysis.intent, intentConfidence: analysis.intentConfidence,
      sentiment: analysis.sentiment, sentimentConfidence: analysis.sentimentConfidence,
    },
  }).catch(() => {});

  if (analysis.sentiment) {
    await prismaUnscoped.leadProfile.updateMany({ where: { contactId: p.contactId }, data: { lastSentiment: analysis.sentiment } }).catch(() => {});
  }

  // Objeção: cria só se não houver outra ABERTA do mesmo tipo (evita duplicar a mesma).
  if (analysis.objection) {
    const open = await prismaUnscoped.leadObjection.findFirst({
      where: { contactId: p.contactId, type: analysis.objection, resolved: false }, select: { id: true },
    }).catch(() => null);
    if (!open) {
      await prismaUnscoped.leadObjection.create({
        data: {
          clientId: p.clientId, connectionId: p.connectionId, contactId: p.contactId,
          type: analysis.objection, severity: analysis.objectionSeverity, raisedMsgId: p.waMessageId,
        },
      }).catch(() => {});
    }
  }

  // Resolução: sinais de avanço encerram objeções abertas deste lead.
  if (resolvesObjections(analysis.intent, analysis.sentiment)) {
    await prismaUnscoped.leadObjection.updateMany({
      where: { contactId: p.contactId, resolved: false }, data: { resolved: true, resolvedAt: new Date() },
    }).catch(() => {});
  }
}
