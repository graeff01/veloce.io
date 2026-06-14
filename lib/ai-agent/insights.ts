import { prismaUnscoped } from "@/lib/prisma";

// ── Sprint 3: AI Insights (agregação rastreável, vendável como premium) ────────
// Tudo deriva de MessageAnalysis + LeadObjection + LeadProfile — explicável, sem
// "mágica". Escopo por cliente (clientId nas tabelas de análise; LeadProfile via
// connectionId). Leitura: prismaUnscoped com filtro explícito (seguro single-tenant).

export interface LeadInsights {
  windowDays: number;
  messagesAnalyzed: number;
  intents: { key: string; count: number; pct: number }[];
  sentiments: { key: string; count: number; pct: number }[];
  objections: { type: string; total: number; resolved: number; unresolved: number; resolutionRate: number }[];
  temperatures: { key: string; count: number }[];
  dropRiskLeads: number;
  evaluation: {
    count: number;
    avgScore: number;
    categories: { key: string; count: number; pct: number }[];
    byVariant: { variant: string; avgScore: number; count: number }[];
    humanReviewPending: number;
  };
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

export async function buildLeadInsights(clientId: string, days = 30): Promise<LeadInsights> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const conns = await prismaUnscoped.waConnection.findMany({ where: { clientId }, select: { id: true } });
  const connIds = conns.map((c) => c.id);

  const [intentRows, sentRows, objRows, dropContacts, tempRows, messagesAnalyzed, evalAgg, evalCatRows, evalVariantRows, humanReviewPending] = await Promise.all([
    prismaUnscoped.messageAnalysis.groupBy({ by: ["intent"], where: { clientId, createdAt: { gte: since }, intent: { not: null } }, _count: { _all: true } }),
    prismaUnscoped.messageAnalysis.groupBy({ by: ["sentiment"], where: { clientId, createdAt: { gte: since }, sentiment: { not: null } }, _count: { _all: true } }),
    prismaUnscoped.leadObjection.groupBy({ by: ["type", "resolved"], where: { clientId, createdAt: { gte: since } }, _count: { _all: true } }),
    prismaUnscoped.messageAnalysis.findMany({ where: { clientId, createdAt: { gte: since }, intent: { in: ["DROP_RISK", "HESITATION"] } }, distinct: ["contactId"], select: { contactId: true } }),
    connIds.length ? prismaUnscoped.leadProfile.groupBy({ by: ["temperature"], where: { connectionId: { in: connIds }, temperature: { not: null } }, _count: { _all: true } }) : Promise.resolve([]),
    prismaUnscoped.messageAnalysis.count({ where: { clientId, createdAt: { gte: since } } }),
    prismaUnscoped.aiResponseEvaluation.aggregate({ where: { clientId, createdAt: { gte: since } }, _avg: { overall: true }, _count: { _all: true } }),
    prismaUnscoped.aiResponseEvaluation.groupBy({ by: ["category"], where: { clientId, createdAt: { gte: since } }, _count: { _all: true } }),
    prismaUnscoped.aiResponseEvaluation.groupBy({ by: ["promptVariant"], where: { clientId, createdAt: { gte: since } }, _avg: { overall: true }, _count: { _all: true } }),
    prismaUnscoped.humanReview.count({ where: { clientId, status: "pending" } }),
  ]);

  const intentTotal = intentRows.reduce((s, r) => s + r._count._all, 0);
  const sentTotal = sentRows.reduce((s, r) => s + r._count._all, 0);

  const intents = intentRows.map((r) => ({ key: r.intent as string, count: r._count._all, pct: pct(r._count._all, intentTotal) })).sort((a, b) => b.count - a.count);
  const sentiments = sentRows.map((r) => ({ key: r.sentiment as string, count: r._count._all, pct: pct(r._count._all, sentTotal) })).sort((a, b) => b.count - a.count);

  // Objeções: consolida [type, resolved] em total/resolvidas/abertas + taxa de resolução.
  const objMap = new Map<string, { resolved: number; unresolved: number }>();
  for (const r of objRows) {
    const e = objMap.get(r.type) ?? { resolved: 0, unresolved: 0 };
    if (r.resolved) e.resolved += r._count._all; else e.unresolved += r._count._all;
    objMap.set(r.type, e);
  }
  const objections = [...objMap.entries()].map(([type, e]) => {
    const total = e.resolved + e.unresolved;
    return { type, total, resolved: e.resolved, unresolved: e.unresolved, resolutionRate: pct(e.resolved, total) };
  }).sort((a, b) => b.total - a.total);

  const temperatures = (tempRows as { temperature: string | null; _count: { _all: number } }[])
    .map((r) => ({ key: r.temperature as string, count: r._count._all })).sort((a, b) => b.count - a.count);

  const evalCount = evalAgg._count._all;
  const categories = evalCatRows.map((r) => ({ key: r.category, count: r._count._all, pct: pct(r._count._all, evalCount) })).sort((a, b) => b.count - a.count);
  const byVariant = evalVariantRows.map((r) => ({ variant: r.promptVariant ?? "(padrão)", avgScore: Math.round((r._avg.overall ?? 0) * 10) / 10, count: r._count._all })).sort((a, b) => b.count - a.count);

  return {
    windowDays: days, messagesAnalyzed, intents, sentiments, objections, temperatures, dropRiskLeads: dropContacts.length,
    evaluation: { count: evalCount, avgScore: Math.round((evalAgg._avg.overall ?? 0) * 10) / 10, categories, byVariant, humanReviewPending },
  };
}
