// ── Camada de Inteligência · Fase 2: juiz LLM da conversa (dimensões qualitativas)
// Complementa o avaliador determinístico (conversation-eval.ts) com o que regra não
// mede: aderência ao DNA de venda, qualidade da CONDUÇÃO e da DESCOBERTA. UMA chamada
// barata (gpt-4o-mini, temp 0), AMOSTRADA e flag-gated (off por padrão) — off = zero custo.
// Observacional. Parse puro/testável; a chamada é isolada. Ver docs/rfc-camada-inteligencia.md.

import { openaiChat } from "@/lib/openai";

export type JudgeMode = "off" | "on";
export function judgeMode(): JudgeMode {
  return (process.env.AI_EVAL_JUDGE || "off").toLowerCase() === "on" ? "on" : "off";
}
export const JUDGE_MODEL = process.env.AI_EVAL_JUDGE_MODEL || "gpt-4o-mini";
export const JUDGE_SAMPLE = Math.max(0, Math.min(1, Number(process.env.AI_EVAL_JUDGE_SAMPLE || 1)));

// Dimensões qualitativas. dnaAdherence só entra quando há DNA configurado (senão null).
export interface JudgeDimension { score: number; status: string; justification: string }
export interface JudgeResult { dimensions: Record<string, JudgeDimension>; confidence: number }

const clamp01 = (n: unknown) => { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; };
const bucket = (s: number) => (s >= 0.8 ? "bom" : s >= 0.5 ? "regular" : "fraco");

const SYSTEM =
  `Você é um avaliador SÊNIOR de vendas. Recebe a TRANSCRIÇÃO de um atendimento por WhatsApp (LEAD × IA) ` +
  `e a REFERÊNCIA da loja (estilo/DNA de venda, objetivo, playbook). Avalie a ATUAÇÃO DA IA, não o lead.\n` +
  `Pontue 0..1 em cada dimensão e justifique em uma frase curta e concreta (cite o que a IA fez):\n` +
  `- "dnaAdherence": seguiu o ESTILO/DNA de venda da loja? (só se houver DNA na referência; senão use null)\n` +
  `- "conductionQuality": conduziu bem? (natural, no ritmo do lead, uma pergunta por vez, avançou sem atropelar)\n` +
  `- "discoveryQuality": entendeu a necessidade do lead sem parecer interrogatório?\n` +
  `Responda SOMENTE JSON: {"dnaAdherence":{"score":0..1|null,"justification":""},` +
  `"conductionQuality":{"score":0..1,"justification":""},"discoveryQuality":{"score":0..1,"justification":""}}`;

interface RawDim { score?: unknown; justification?: unknown }
interface RawJudge { dnaAdherence?: RawDim | null; conductionQuality?: RawDim; discoveryQuality?: RawDim }

// Parse puro: valida/normaliza a saída do LLM. null quando não veio JSON usável.
export function parseConversationJudge(raw: string): JudgeResult | null {
  let o: RawJudge;
  try { o = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { return null; }
  const dims: Record<string, JudgeDimension> = {};
  const add = (key: string, d: RawDim | null | undefined, allowNull = false) => {
    if (allowNull && (d == null || d.score == null)) return; // dimensão não-aplicável
    if (!d) return;
    const score = clamp01(d.score);
    dims[key] = { score, status: bucket(score), justification: typeof d.justification === "string" ? d.justification.slice(0, 240) : "" };
  };
  add("dnaAdherence", o.dnaAdherence, true);
  add("conductionQuality", o.conductionQuality);
  add("discoveryQuality", o.discoveryQuality);
  if (!Object.keys(dims).length) return null;
  return { dimensions: dims, confidence: 0.7 }; // juiz LLM: confiança média (menor que o determinístico)
}

// UMA chamada de modelo → dimensões qualitativas. Best-effort: null em erro.
export async function judgeConversation(opts: { clientId: string; transcript: string; reference: string; model?: string }): Promise<JudgeResult | null> {
  if (!opts.transcript.trim()) return null;
  try {
    const { message } = await openaiChat({
      model: opts.model ?? JUDGE_MODEL, temperature: 0, maxTokens: 320,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `REFERÊNCIA DA LOJA:\n${opts.reference || "(sem DNA/playbook configurado)"}\n\nTRANSCRIÇÃO:\n${opts.transcript.slice(-6000)}` },
      ],
      meta: { clientId: opts.clientId, pipeline: "judge", tenantKey: opts.clientId },
    });
    return parseConversationJudge(message.content ?? "");
  } catch { return null; }
}
