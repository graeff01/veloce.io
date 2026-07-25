// ── Camada de Inteligência · Fase 3: runner do motor de recomendações ──────────
// Agrega os sinais do banco (avaliações da Fase 1 + objeções + respostas sem fonte) →
// chama os geradores puros (learning-reco.ts) → faz upsert com DEDUPE por (clientId,
// signature). Recomendação PENDENTE é atualizada (refresca evidência); aprovada/rejeitada
// NÃO é re-sugerida (respeita a decisão humana). Observacional, zero custo de modelo.

import { prismaUnscoped } from "@/lib/prisma";
import { buildRecommendations, type AggregatedSignals, type DimensionStat, type RecoEvidence } from "./learning-reco";
import { Prisma } from "@prisma/client";

const LOW = 0.6;          // score de dimensão abaixo disto = "baixa"
const NO_SOURCE = new Set(["abster", "sem_fonte"]);

interface DimBlock { score: number | null; status?: string; evidence?: { reason?: string }[] }

async function aggregate(clientId: string, windowDays: number): Promise<AggregatedSignals> {
  const since = new Date(Date.now() - windowDays * 864e5);

  const [evals, objections, noSrc, totalRows] = await Promise.all([
    prismaUnscoped.conversationEvaluation.findMany({ where: { clientId, createdAt: { gte: since } }, select: { contactId: true, dimensions: true } }),
    prismaUnscoped.leadObjection.findMany({ where: { clientId, createdAt: { gte: since } }, select: { contactId: true, type: true, severity: true } }),
    prismaUnscoped.aiInteraction.findMany({ where: { clientId, createdAt: { gte: since }, decision: { in: [...NO_SOURCE] } }, select: { contactId: true, inbound: true, idempotencyKey: true } }),
    prismaUnscoped.aiInteraction.findMany({ where: { clientId, createdAt: { gte: since } }, distinct: ["contactId"], select: { contactId: true } }),
  ]);

  // Dimensões baixas (da ConversationEvaluation) — agrupa conversas por dimensão fraca.
  const dimMap = new Map<string, RecoEvidence[]>();
  for (const e of evals) {
    const dims = (e.dimensions ?? {}) as unknown as Record<string, DimBlock>;
    for (const [dim, block] of Object.entries(dims)) {
      if (block?.score == null || block.score >= LOW) continue;
      const list = dimMap.get(dim) ?? [];
      list.push({ contactId: e.contactId, excerpt: block.evidence?.[0]?.reason ?? block.status ?? "" });
      dimMap.set(dim, list);
    }
  }
  const dimensions: DimensionStat[] = [...dimMap.entries()].map(([dimension, lowConversations]) => ({ dimension, lowConversations }));

  // Objeções por tipo → conversas distintas.
  const objMap = new Map<string, { ids: Set<string>; sev: number[] }>();
  for (const o of objections) {
    const e = objMap.get(o.type) ?? { ids: new Set<string>(), sev: [] };
    e.ids.add(o.contactId); if (o.severity != null) e.sev.push(o.severity);
    objMap.set(o.type, e);
  }
  const objectionsAgg = [...objMap.entries()].map(([type, e]) => ({ type, contactIds: [...e.ids], avgSeverity: e.sev.length ? e.sev.reduce((a, b) => a + b, 0) / e.sev.length : 0 }));

  // Conhecimento ausente (abster/sem fonte) → conversas distintas + amostras.
  const noSrcIds = new Set<string>(); const samples: RecoEvidence[] = [];
  for (const it of noSrc) {
    if (it.contactId) noSrcIds.add(it.contactId);
    if (samples.length < 20 && it.inbound) samples.push({ contactId: it.contactId ?? undefined, waMessageId: it.idempotencyKey, excerpt: it.inbound.replace(/\s+/g, " ").slice(0, 80) });
  }

  return {
    totalConversations: totalRows.length,
    windowDays,
    dimensions,
    objections: objectionsAgg,
    noSource: { contactIds: [...noSrcIds], samples },
  };
}

// Gera/atualiza as recomendações de UM cliente. Retorna quantas criou/atualizou.
export async function generateRecommendations(clientId: string, windowDays = 30): Promise<{ created: number; updated: number; skipped: number }> {
  const signals = await aggregate(clientId, windowDays);
  const recos = buildRecommendations(signals);
  let created = 0, updated = 0, skipped = 0;
  for (const r of recos) {
    const existing = await prismaUnscoped.learningRecommendation.findUnique({ where: { clientId_signature: { clientId, signature: r.signature } }, select: { id: true, status: true } }).catch(() => null);
    const data = {
      type: r.type, title: r.title, targetComponent: r.targetComponent,
      evidence: r.evidence as unknown as Prisma.InputJsonValue,
      conversationCount: r.conversationCount, rate: r.rate, confidence: r.confidence,
      expectedImpact: r.expectedImpact as unknown as Prisma.InputJsonValue,
      proposedChange: r.proposedChange as unknown as Prisma.InputJsonValue,
      windowDays,
    };
    if (!existing) { await prismaUnscoped.learningRecommendation.create({ data: { clientId, signature: r.signature, ...data } }).catch(() => {}); created++; }
    else if (existing.status === "pendente") { await prismaUnscoped.learningRecommendation.update({ where: { id: existing.id }, data }).catch(() => {}); updated++; }
    else skipped++; // aprovada/rejeitada/promovida → respeita a decisão humana
  }
  return { created, updated, skipped };
}

// Todos os clientes (cross-client, como os outros schedulers).
export async function generateAllRecommendations(windowDays = 30): Promise<{ clients: number; created: number; updated: number }> {
  const cfgs = await prismaUnscoped.aiAgentConfig.findMany({ select: { clientId: true } });
  let created = 0, updated = 0;
  for (const c of cfgs) {
    const r = await generateRecommendations(c.clientId, windowDays).catch(() => ({ created: 0, updated: 0, skipped: 0 }));
    created += r.created; updated += r.updated;
  }
  return { clients: cfgs.length, created, updated };
}
