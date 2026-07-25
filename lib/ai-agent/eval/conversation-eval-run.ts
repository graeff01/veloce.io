// ── Camada de Inteligência · Fase 1: runner do avaliador determinístico ────────
// Ponte entre os scorers PUROS (conversation-eval.ts) e o banco: carrega os sinais
// que o Runtime já emite → monta a ConversationView → scoreia → persiste
// ConversationEvaluation. Observacional, assíncrono, best-effort (nunca afeta o
// atendimento). Idempotente por (contactId, closureAt).

import { prismaUnscoped } from "@/lib/prisma";
import { parseSpec } from "../intake";
import { scoreConversation, aggregateOverall, type ConversationView, type EvalTurn } from "./conversation-eval";
import { judgeMode, judgeConversation, JUDGE_SAMPLE } from "./conversation-judge";
import { shouldSample } from "../evaluation";
import { Prisma } from "@prisma/client";

const CLOSE_HOURS = Number(process.env.AI_EVAL_CLOSE_HOURS || 6);

interface ToolLog { name?: string; result?: string | null }

// Monta a ConversationView + a REFERÊNCIA (DNA/objetivo/persona) de UM contato.
async function buildView(clientId: string, contactId: string): Promise<{ view: ConversationView; reference: string } | null> {
  const [interactions, analyses, profile, convo, cfg] = await Promise.all([
    prismaUnscoped.aiInteraction.findMany({
      where: { clientId, contactId }, orderBy: { createdAt: "asc" },
      select: { inbound: true, outbound: true, decision: true, status: true, toolCalls: true, guardrails: true, idempotencyKey: true },
    }),
    prismaUnscoped.messageAnalysis.findMany({ where: { clientId, contactId }, select: { waMessageId: true, intent: true } }),
    prismaUnscoped.leadProfile.findUnique({ where: { contactId }, select: { data: true } }).catch(() => null),
    prismaUnscoped.waConversation.findUnique({ where: { contactId }, select: { funnelStage: true } }).catch(() => null),
    prismaUnscoped.aiAgentConfig.findUnique({ where: { clientId }, select: { quotesEnabled: true, presentationVideoUrl: true, intakeSpec: true, vertical: true, salesDna: true, salesDnaEnabled: true, goals: true, persona: true } }),
  ]);
  if (!interactions.length) return null;

  const intentByMsg = new Map(analyses.filter((a) => a.waMessageId).map((a) => [a.waMessageId as string, a.intent]));
  const turns: EvalTurn[] = interactions.map((it) => ({
    inbound: it.inbound, outbound: it.outbound, decision: it.decision, status: it.status,
    guardrails: Array.isArray(it.guardrails) ? (it.guardrails as string[]) : [],
    tools: Array.isArray(it.toolCalls) ? (it.toolCalls as unknown as ToolLog[]).map((t) => ({ name: t?.name ?? "", result: t?.result ?? null })) : [],
    intent: it.idempotencyKey ? (intentByMsg.get(it.idempotencyKey) ?? null) : null,
    waMessageId: it.idempotencyKey ?? null,
  }));

  const requiredFields = parseSpec(cfg?.intakeSpec).filter((f) => f.required).map((f) => ({ key: f.key, label: f.label }));
  const view: ConversationView = {
    turns, ficha: (profile?.data as Record<string, unknown>) ?? {}, requiredFields,
    funnelStage: convo?.funnelStage ?? null, quotesEnabled: cfg?.quotesEnabled ?? false,
    hasVideo: !!cfg?.presentationVideoUrl, vertical: cfg?.vertical ?? "servicos",
  };
  const reference = [
    cfg?.salesDnaEnabled && cfg?.salesDna ? `DNA de venda:\n${cfg.salesDna}` : "",
    cfg?.goals ? `Objetivo: ${cfg.goals}` : "",
    cfg?.persona ? `Tom/persona: ${cfg.persona}` : "",
  ].filter(Boolean).join("\n\n");
  return { view, reference };
}

// Avalia UMA conversa e persiste (upsert por contactId+closureAt). Best-effort.
// Determinístico sempre; juiz LLM só quando AI_EVAL_JUDGE=on + amostrado (custo controlado).
export async function evaluateConversation(clientId: string, contactId: string, closureAt: Date): Promise<boolean> {
  try {
    const built = await buildView(clientId, contactId);
    if (!built) return false;
    const { view, reference } = built;
    const r = scoreConversation(view);
    const dimensions: Record<string, unknown> = { ...r.dimensions };
    let overall = r.overall, confidence = r.confidence;
    let method: string = r.method;

    // Fase 2 (juiz LLM): dimensões qualitativas, mescladas — recomputa o overall.
    if (judgeMode() === "on" && view.turns.length >= 2 && shouldSample(JUDGE_SAMPLE)) {
      const transcript = view.turns.filter((t) => t.inbound || t.outbound).map((t) => `${t.inbound ? `LEAD: ${t.inbound}` : ""}${t.outbound ? `\nIA: ${t.outbound}` : ""}`).join("\n");
      const j = await judgeConversation({ clientId, transcript, reference });
      if (j) {
        Object.assign(dimensions, j.dimensions);
        overall = aggregateOverall(dimensions as Record<string, { score: number | null }>);
        confidence = Math.round(((r.confidence + j.confidence) / 2) * 1000) / 1000;
        method = "hybrid";
      }
    }

    await prismaUnscoped.conversationEvaluation.upsert({
      where: { contactId_closureAt: { contactId, closureAt } },
      create: { clientId, contactId, closureAt, overall, confidence, method, rubricVersion: r.rubricVersion, turnCount: view.turns.length, dimensions: dimensions as unknown as Prisma.InputJsonValue },
      update: { overall, confidence, method, rubricVersion: r.rubricVersion, turnCount: view.turns.length, dimensions: dimensions as unknown as Prisma.InputJsonValue },
    });
    return true;
  } catch {
    return false; // observacional: nunca propaga erro
  }
}

// Gatilho: varre conversas FECHADAS (inatividade ≥ CLOSE_HOURS) ainda sem avaliação
// para o fechamento atual, e avalia. closureAt = lastMessageAt (reabre → nova avaliação).
// Cross-client de propósito (prismaUnscoped), como os outros schedulers.
export async function runConversationEvals(opts: { limit?: number } = {}): Promise<{ evaluated: number }> {
  const limit = opts.limit ?? 200;
  const cutoff = new Date(Date.now() - CLOSE_HOURS * 3600_000);
  const conns = await prismaUnscoped.waConnection.findMany({ select: { id: true, clientId: true } });
  const clientByConn = new Map(conns.map((c) => [c.id, c.clientId]));

  const candidates = await prismaUnscoped.waConversation.findMany({
    where: { lastMessageAt: { lt: cutoff, not: null }, connectionId: { in: [...clientByConn.keys()] } },
    orderBy: { lastMessageAt: "desc" }, take: limit,
    select: { contactId: true, connectionId: true, lastMessageAt: true },
  });

  let evaluated = 0;
  for (const c of candidates) {
    const clientId = clientByConn.get(c.connectionId);
    if (!clientId || !c.lastMessageAt) continue;
    // já avaliado para ESTE fechamento?
    const exists = await prismaUnscoped.conversationEvaluation.findUnique({
      where: { contactId_closureAt: { contactId: c.contactId, closureAt: c.lastMessageAt } }, select: { id: true },
    }).catch(() => null);
    if (exists) continue;
    if (await evaluateConversation(clientId, c.contactId, c.lastMessageAt)) evaluated++;
  }
  return { evaluated };
}
