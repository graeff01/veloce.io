import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// Séries temporais para gráficos (grupo Inteligência).
// Buckets diários (UTC) a partir de fontes com timestamp real:
//  • leads/answered  → WaConversation.firstInboundAt / firstResponseAt
//  • conversions     → WaEvent "funnel.changed" stage="convertido" (data do evento)
//  • costUsd         → AiUsage.costUsd
//  • hot/avgScore    → LeadProfile por updatedAt (estado do perfil no dia em que mudou)
// Escopo por clientId. Sem dado → série zerada com shape correto.

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days") || 30)));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  type Bucket = { date: string; leads: number; answered: number; hot: number; conversions: number; costUsd: number; avgScore: number };
  const series: Record<string, Bucket> = {};
  const scoreAcc: Record<string, { sum: number; n: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 86400000));
    series[k] = { date: k, leads: 0, answered: 0, hot: 0, conversions: 0, costUsd: 0, avgScore: 0 };
    scoreAcc[k] = { sum: 0, n: 0 };
  }
  const at = (d: Date | null | undefined): Bucket | undefined => (d ? series[dayKey(d)] : undefined);

  const conns = await prismaUnscoped.waConnection.findMany({ where: { clientId: id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);

  if (connIds.length === 0) {
    return NextResponse.json({ series: Object.values(series), totals: { leads: 0, conversions: 0, costUsd: 0 } });
  }

  const [convos, profiles, usage, convEvents] = await Promise.all([
    prismaUnscoped.waConversation.findMany({
      where: { connectionId: { in: connIds }, firstInboundAt: { gte: since } },
      select: { firstInboundAt: true, firstResponseAt: true },
    }),
    prismaUnscoped.leadProfile.findMany({
      where: { connectionId: { in: connIds }, updatedAt: { gte: since } },
      select: { updatedAt: true, score: true, temperature: true },
    }),
    prismaUnscoped.aiUsage.findMany({
      where: { clientId: id, createdAt: { gte: since } },
      select: { createdAt: true, costUsd: true },
    }),
    prismaUnscoped.waEvent.findMany({
      where: { connectionId: { in: connIds }, type: "funnel.changed", createdAt: { gte: since } },
      select: { refId: true, data: true, createdAt: true }, orderBy: { createdAt: "asc" },
    }),
  ]);

  let totalLeads = 0;
  for (const c of convos) {
    const inB = at(c.firstInboundAt);
    if (inB) { inB.leads++; totalLeads++; }
    const ansB = at(c.firstResponseAt);
    if (ansB) ansB.answered++;
  }

  // Conversões por timestamp real do evento; 1ª vez que cada lead virou "convertido".
  const convertedAt = new Map<string, Date>();
  for (const e of convEvents) {
    if (!e.refId || (e.data as { stage?: string } | null)?.stage !== "convertido") continue;
    if (!convertedAt.has(e.refId)) convertedAt.set(e.refId, e.createdAt);
  }
  for (const d of convertedAt.values()) { const b = at(d); if (b) b.conversions++; }
  const totalConversions = convertedAt.size;

  for (const p of profiles) {
    const b = at(p.updatedAt);
    if (!b) continue;
    if (p.temperature === "hot") b.hot++;
    const acc = scoreAcc[b.date];
    acc.sum += p.score; acc.n++;
  }
  for (const b of Object.values(series)) {
    const acc = scoreAcc[b.date];
    b.avgScore = acc.n ? Math.round(acc.sum / acc.n) : 0;
  }

  let totalCost = 0;
  for (const u of usage) {
    totalCost += u.costUsd;
    const b = at(u.createdAt);
    if (b) b.costUsd += u.costUsd;
  }
  for (const b of Object.values(series)) b.costUsd = Math.round(b.costUsd * 1e6) / 1e6;

  return NextResponse.json({
    series: Object.values(series),
    totals: { leads: totalLeads, conversions: totalConversions, costUsd: Math.round(totalCost * 1e6) / 1e6 },
  });
}
