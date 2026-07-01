import { prismaUnscoped } from "@/lib/prisma";

// ── Hardening: medição de custo por pipeline (fonte única) ─────────────────────
// Preços por 1M de tokens (USD). Mantenha sincronizado com a tabela da OpenAI.
const PRICES: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.60 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "text-embedding-3-small": { in: 0.02, out: 0 },
  "text-embedding-3-large": { in: 0.13, out: 0 },
};
const DEFAULT_PRICE = { in: 0.15, out: 0.60 };

export type Pipeline = "chat" | "memory" | "intelligence" | "judge" | "embedding";

export function costOf(model: string | undefined, tokensIn: number, tokensOut: number): number {
  const p = PRICES[model ?? ""] ?? DEFAULT_PRICE;
  return (tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out;
}

// Best-effort: nunca lança (não pode quebrar o atendimento por causa de telemetria).
export async function recordUsage(u: {
  clientId?: string; pipeline: Pipeline; model?: string; tokensIn: number; tokensOut: number;
}): Promise<void> {
  if (!u.clientId) return;
  const costUsd = costOf(u.model, u.tokensIn, u.tokensOut);
  await prismaUnscoped.aiUsage.create({
    data: { clientId: u.clientId, pipeline: u.pipeline, model: u.model ?? null, tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd },
  }).catch(() => {});
}

// Soma de custo do dia (a partir da meia-noite local) — usado por caps e alertas.
export async function spendToday(where: { clientId?: string }): Promise<number> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const agg = await prismaUnscoped.aiUsage.aggregate({
    where: { createdAt: { gte: start }, ...(where.clientId ? { clientId: where.clientId } : {}) },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

async function spendSince(clientId: string, since: Date): Promise<number> {
  const agg = await prismaUnscoped.aiUsage.aggregate({ where: { clientId, createdAt: { gte: since } }, _sum: { costUsd: true } });
  return agg._sum.costUsd ?? 0;
}

export interface CostBreakdown {
  today: number; last7d: number; last30d: number;
  byPipeline: { pipeline: string; costUsd: number }[];
  leads30d: number; costPerLead: number;
}

// Custo agregado numa janela arbitrária (dias) + custo por lead — usado pelo painel de impacto.
export async function windowCost(clientId: string, days: number): Promise<{ totalUsd: number; leads: number; perLeadUsd: number }> {
  const since = new Date(Date.now() - days * 864e5);
  const [total, leadRows] = await Promise.all([
    spendSince(clientId, since),
    prismaUnscoped.aiInteraction.findMany({ where: { clientId, createdAt: { gte: since } }, distinct: ["contactId"], select: { contactId: true } }),
  ]);
  const leads = leadRows.length;
  return { totalUsd: Math.round(total * 1e4) / 1e4, leads, perLeadUsd: leads ? Math.round((total / leads) * 1e4) / 1e4 : 0 };
}

// Cost monitor por cliente — hoje / 7d / 30d + por pipeline + custo por lead.
export async function costBreakdown(clientId: string): Promise<CostBreakdown> {
  const now = Date.now();
  const d7 = new Date(now - 7 * 864e5);
  const d30 = new Date(now - 30 * 864e5);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [today, last7d, last30d, pipeRows, leads] = await Promise.all([
    spendSince(clientId, todayStart),
    spendSince(clientId, d7),
    spendSince(clientId, d30),
    prismaUnscoped.aiUsage.groupBy({ by: ["pipeline"], where: { clientId, createdAt: { gte: d30 } }, _sum: { costUsd: true } }),
    prismaUnscoped.aiInteraction.findMany({ where: { clientId, createdAt: { gte: d30 } }, distinct: ["contactId"], select: { contactId: true } }),
  ]);

  const byPipeline = pipeRows.map((r) => ({ pipeline: r.pipeline, costUsd: Math.round((r._sum.costUsd ?? 0) * 1e4) / 1e4 })).sort((a, b) => b.costUsd - a.costUsd);
  const leads30d = leads.length;
  return {
    today: Math.round(today * 1e4) / 1e4, last7d: Math.round(last7d * 1e4) / 1e4, last30d: Math.round(last30d * 1e4) / 1e4,
    byPipeline, leads30d, costPerLead: leads30d ? Math.round((last30d / leads30d) * 1e4) / 1e4 : 0,
  };
}
