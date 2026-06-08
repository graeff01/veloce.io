import { prismaUnscoped } from "@/lib/prisma";

// Disjuntor global de gasto diário (todos os tenants). Opcional via env.
// Query intencionalmente cross-tenant → usa prismaUnscoped (exceção documentada ao guard).
// Custo estimado com base nos tokens do dia (preço gpt-4o-mini). Cache de 60s.
let cache: { at: number; usd: number } | null = null;

export async function globalSpendExceeded(): Promise<boolean> {
  const cap = Number(process.env.AI_AGENT_DAILY_USD_CAP || 0);
  if (!cap) return false;
  const now = Date.now();
  if (!cache || now - cache.at > 60_000) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const agg = await prismaUnscoped.aiInteraction.aggregate({ where: { createdAt: { gte: start } }, _sum: { tokensIn: true, tokensOut: true } });
    const usd = ((agg._sum.tokensIn ?? 0) / 1e6) * 0.15 + ((agg._sum.tokensOut ?? 0) / 1e6) * 0.6;
    cache = { at: now, usd };
  }
  return cache.usd >= cap;
}
