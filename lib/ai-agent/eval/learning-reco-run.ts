// ── Camada de Inteligência · Fase 3: runner do motor de recomendações ──────────
// Agrega os sinais do banco (avaliações da Fase 1 + objeções + respostas sem fonte) →
// chama os geradores puros (learning-reco.ts) → faz upsert com DEDUPE por (clientId,
// signature). Recomendação PENDENTE é atualizada (refresca evidência); aprovada/rejeitada
// NÃO é re-sugerida (respeita a decisão humana). Observacional, zero custo de modelo.

import { prismaUnscoped } from "@/lib/prisma";
import { embed } from "@/lib/openai";
import { buildRecommendations, confidenceFor, rnd, type AggregatedSignals, type DimensionStat, type RecoEvidence, type Recommendation } from "./learning-reco";
import { clusterBySimilarity, topicSlug } from "./reco-cluster";
import { Prisma } from "@prisma/client";

export function clusterMode(): "off" | "on" {
  return (process.env.AI_EVAL_CLUSTER || "off").toLowerCase() === "on" ? "on" : "off";
}

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

// Upsert com DEDUPE por (clientId, signature). Pendente atualiza; aprovada/rejeitada NÃO
// re-sugere (respeita a decisão humana). Fonte única usada pelos dois geradores.
async function upsertReco(clientId: string, r: Recommendation, windowDays: number): Promise<"created" | "updated" | "skipped"> {
  const existing = await prismaUnscoped.learningRecommendation.findUnique({ where: { clientId_signature: { clientId, signature: r.signature } }, select: { id: true, status: true } }).catch(() => null);
  const data = {
    type: r.type, title: r.title, targetComponent: r.targetComponent,
    evidence: r.evidence as unknown as Prisma.InputJsonValue,
    conversationCount: r.conversationCount, rate: r.rate, confidence: r.confidence,
    expectedImpact: r.expectedImpact as unknown as Prisma.InputJsonValue,
    proposedChange: r.proposedChange as unknown as Prisma.InputJsonValue,
    windowDays,
  };
  if (!existing) { await prismaUnscoped.learningRecommendation.create({ data: { clientId, signature: r.signature, ...data } }).catch(() => {}); return "created"; }
  if (existing.status === "pendente") { await prismaUnscoped.learningRecommendation.update({ where: { id: existing.id }, data }).catch(() => {}); return "updated"; }
  return "skipped";
}

// Gera/atualiza as recomendações determinísticas de UM cliente (Fase 3).
export async function generateRecommendations(clientId: string, windowDays = 30): Promise<{ created: number; updated: number; skipped: number }> {
  const recos = buildRecommendations(await aggregate(clientId, windowDays));
  let created = 0, updated = 0, skipped = 0;
  for (const r of recos) { const res = await upsertReco(clientId, r, windowDays); if (res === "created") created++; else if (res === "updated") updated++; else skipped++; }
  return { created, updated, skipped };
}

// Fase 4: clustering das perguntas sem resposta (abster/sem_fonte) por embedding →
// recomendações de conhecimento com o TÓPICO real. Flag-gated (custa embedding, barato).
export async function generateClusterRecommendations(clientId: string, windowDays = 30): Promise<{ created: number; updated: number; skipped: number }> {
  if (clusterMode() !== "on") return { created: 0, updated: 0, skipped: 0 };
  const since = new Date(Date.now() - windowDays * 864e5);
  const min = 3;
  const rows = await prismaUnscoped.aiInteraction.findMany({
    where: { clientId, createdAt: { gte: since }, decision: { in: [...NO_SOURCE] }, inbound: { not: null } },
    orderBy: { createdAt: "desc" }, take: 300, select: { inbound: true, contactId: true, idempotencyKey: true },
  });
  if (rows.length < min) return { created: 0, updated: 0, skipped: 0 };
  const texts = rows.map((r) => (r.inbound ?? "").slice(0, 300));
  const embs = await embed(texts, { clientId, pipeline: "embedding", tenantKey: clientId }).catch(() => [] as number[][]);
  if (embs.length !== rows.length) return { created: 0, updated: 0, skipped: 0 };

  const items = rows.map((r, i) => ({ id: String(i), text: r.inbound ?? "", emb: embs[i], contactId: r.contactId, waMessageId: r.idempotencyKey }));
  const clusters = clusterBySimilarity(items, 0.82);
  const total = (await prismaUnscoped.aiInteraction.findMany({ where: { clientId, createdAt: { gte: since } }, distinct: ["contactId"], select: { contactId: true } })).length || 1;

  let created = 0, updated = 0, skipped = 0;
  for (const c of clusters) {
    const ids = new Set(c.members.map((m) => m.contactId).filter(Boolean) as string[]);
    if (ids.size < min) continue;
    const rate = rnd(ids.size / total);
    const topic = c.repText.replace(/\s+/g, " ").trim();
    const reco: Recommendation = {
      signature: `conhecimento_ausente:cluster:${topicSlug(topic)}`,
      type: "conhecimento_ausente",
      title: `Leads perguntam sobre "${topic.slice(0, 50)}" (${ids.size} conversas) — a IA não tem resposta.`,
      targetComponent: "conhecimento",
      evidence: c.members.slice(0, 20).map((m) => ({ contactId: m.contactId ?? undefined, waMessageId: m.waMessageId, excerpt: m.text.slice(0, 80) })),
      conversationCount: ids.size, rate, confidence: confidenceFor(ids.size),
      expectedImpact: { reach: rate, basis: `${(rate * 100).toFixed(0)}% das conversas batem nesse tópico sem resposta` },
      proposedChange: { summary: `cadastrar conteúdo (RAG/FAQ) sobre: ${topic.slice(0, 120)}` },
    };
    const res = await upsertReco(clientId, reco, windowDays);
    if (res === "created") created++; else if (res === "updated") updated++; else skipped++;
  }
  return { created, updated, skipped };
}

// Todos os clientes (cross-client, como os outros schedulers). Roda Fase 3 + Fase 4.
export async function generateAllRecommendations(windowDays = 30): Promise<{ clients: number; created: number; updated: number }> {
  const cfgs = await prismaUnscoped.aiAgentConfig.findMany({ select: { clientId: true } });
  let created = 0, updated = 0;
  for (const c of cfgs) {
    const a = await generateRecommendations(c.clientId, windowDays).catch(() => ({ created: 0, updated: 0, skipped: 0 }));
    const b = await generateClusterRecommendations(c.clientId, windowDays).catch(() => ({ created: 0, updated: 0, skipped: 0 }));
    created += a.created + b.created; updated += a.updated + b.updated;
  }
  return { clients: cfgs.length, created, updated };
}
