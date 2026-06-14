import { prismaUnscoped } from "@/lib/prisma";
import { openaiChat } from "@/lib/openai";

// ── Sprint 4: Response Evaluation + AI Judge (assíncrono, amostrado) ───────────
// UMA chamada de "juiz" produz score + breakdown + categoria de fraqueza + sugestão.
// Roda fora do caminho crítico e é AMOSTRADA para controlar custo. Persiste em
// AiResponseEvaluation. Partes de taxonomia/parse/amostragem são puras e testáveis.

export const EVAL_CATEGORIES = [
  "excellent", "missed_objection", "weak_qualification",
  "robotic_tone", "overexplaining", "poor_followup", "weak_closing",
] as const;
export type EvalCategory = (typeof EVAL_CATEGORIES)[number];

export interface Evaluation {
  overall: number;
  naturalness: number; empathy: number; clarity: number;
  persuasion: number; qualification: number; conversationFlow: number;
  category: EvalCategory;
  suggestion: string | null;
  severity: number;
}

const clamp10 = (n: unknown) => { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(10, x)) : 0; };
const clamp01 = (n: unknown) => { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; };

// Amostragem determinística por rng injetável (testável).
export function shouldSample(rate: number, rnd = Math.random()): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return rnd < rate;
}

export function parseEvaluation(raw: string): Evaluation | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch { return null; }
  const cat = typeof o.category === "string" ? o.category.toLowerCase().trim() : "";
  const category = (EVAL_CATEGORIES as readonly string[]).includes(cat) ? (cat as EvalCategory) : null;
  if (category == null || o.overall == null) return null;
  return {
    overall: clamp10(o.overall),
    naturalness: clamp10(o.naturalness), empathy: clamp10(o.empathy), clarity: clamp10(o.clarity),
    persuasion: clamp10(o.persuasion), qualification: clamp10(o.qualification), conversationFlow: clamp10(o.conversationFlow),
    category,
    suggestion: typeof o.suggestion === "string" ? o.suggestion.slice(0, 300) : null,
    severity: clamp01(o.severity),
  };
}

const SAMPLE = Number(process.env.AI_EVAL_SAMPLE ?? 1);          // fração avaliada (0..1)
const HUMAN_EVERY = Number(process.env.AI_HUMAN_REVIEW_EVERY || 30); // 1 a cada N p/ revisão humana
const JUDGE_MODEL = process.env.AI_JUDGE_MODEL || "gpt-4o-mini";  // idealmente um modelo distinto (ver Extra)

const SYSTEM =
  `Você é um JUIZ de qualidade de atendimento de vendas por WhatsApp. Avalie a RESPOSTA DA IA.\n` +
  `Responda APENAS JSON, direto, sem texto extra:\n` +
  `{"overall":0-10,"naturalness":0-10,"empathy":0-10,"clarity":0-10,"persuasion":0-10,"qualification":0-10,"conversationFlow":0-10,` +
  `"category":"<uma de: ${EVAL_CATEGORIES.join("|")}>","suggestion":"<1 frase curta ou null>","severity":0-1}\n` +
  `Use "excellent" quando a resposta for ótima. Escolha a fraqueza MAIS relevante caso contrário. Seja rígido e conciso.`;

export async function evaluateResponse(p: {
  clientId: string; contactId: string; waMessageId?: string;
  leadMessage: string; aiMessage: string;
  promptVersion?: string; promptVariant?: string | null; model?: string;
}): Promise<void> {
  if (!shouldSample(SAMPLE)) return;
  if (!p.aiMessage?.trim() || !p.leadMessage?.trim()) return;

  let evaluation: Evaluation | null = null;
  try {
    const { message } = await openaiChat({
      model: JUDGE_MODEL, temperature: 0, maxTokens: 200,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `LEAD: ${p.leadMessage.slice(0, 800)}\n\nRESPOSTA DA IA: ${p.aiMessage.slice(0, 800)}` },
      ],
      meta: { clientId: p.clientId, pipeline: "judge", tenantKey: p.clientId },
    });
    evaluation = parseEvaluation(message.content || "");
  } catch { return; }
  if (!evaluation) return;

  await prismaUnscoped.aiResponseEvaluation.create({
    data: {
      clientId: p.clientId, contactId: p.contactId, waMessageId: p.waMessageId ?? null,
      overall: evaluation.overall, naturalness: evaluation.naturalness, empathy: evaluation.empathy,
      clarity: evaluation.clarity, persuasion: evaluation.persuasion, qualification: evaluation.qualification,
      conversationFlow: evaluation.conversationFlow, category: evaluation.category,
      suggestion: evaluation.suggestion, severity: evaluation.severity,
      promptVersion: p.promptVersion ?? null, promptVariant: p.promptVariant ?? null, model: p.model ?? null,
    },
  }).catch(() => {});

  // Ground truth: amostra para revisão humana (não depende só do LLM judge).
  if (shouldSample(1 / Math.max(1, HUMAN_EVERY))) {
    await prismaUnscoped.humanReview.create({
      data: {
        clientId: p.clientId, contactId: p.contactId, waMessageId: p.waMessageId ?? null,
        leadMessage: p.leadMessage.slice(0, 1000), aiMessage: p.aiMessage.slice(0, 1000),
      },
    }).catch(() => {});
  }
}
