import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// Observabilidade: últimos turnos da IA + métricas agregadas.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const [items, grouped, agg] = await Promise.all([
    prisma.aiInteraction.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.aiInteraction.groupBy({ by: ["decision"], where: { clientId: id }, _count: true }),
    prisma.aiInteraction.aggregate({ where: { clientId: id }, _count: true, _avg: { latencyMs: true }, _sum: { tokensIn: true, tokensOut: true } }),
  ]);

  const byDecision: Record<string, number> = {};
  for (const g of grouped) byDecision[g.decision ?? "—"] = g._count;

  return NextResponse.json({
    items,
    metrics: {
      total: agg._count,
      avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
      tokensIn: agg._sum.tokensIn ?? 0,
      tokensOut: agg._sum.tokensOut ?? 0,
      byDecision,
    },
  });
}
