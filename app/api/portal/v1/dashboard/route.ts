import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;
  const { session } = auth;

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30prev = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [waConn, metaConn] = await Promise.all([
    prisma.waConnection.findUnique({ where: { clientId: session.clientId } }),
    prisma.metaConnection.findUnique({ where: { clientId: session.clientId } }),
  ]);

  // Conversas (leads) — período atual e anterior
  const [convs30, convs30prev, convs7] = await Promise.all([
    prisma.waConversation.findMany({
      where: {
        connectionId: waConn?.id ?? "",
        firstInboundAt: { gte: d30 },
      },
      select: { id: true, firstResponseSec: true, funnelStage: true, firstInboundAt: true },
    }),
    prisma.waConversation.count({
      where: {
        connectionId: waConn?.id ?? "",
        firstInboundAt: { gte: d30prev, lt: d30 },
      },
    }),
    prisma.waConversation.count({
      where: {
        connectionId: waConn?.id ?? "",
        firstInboundAt: { gte: d7 },
      },
    }),
  ]);

  // Meta Ads — período atual e anterior
  const [metaCurr, metaPrev] = await Promise.all([
    prisma.metaInsight.aggregate({
      where: { connectionId: metaConn?.id ?? "", dateStart: { gte: d30 } },
      _sum: { spend: true, leads: true },
    }),
    prisma.metaInsight.aggregate({
      where: { connectionId: metaConn?.id ?? "", dateStart: { gte: d30prev, lt: d30 } },
      _sum: { spend: true, leads: true },
    }),
  ]);

  // Série temporal de leads (últimos 30 dias)
  const series: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    series[d.toISOString().slice(0, 10)] = 0;
  }
  for (const c of convs30) {
    if (c.firstInboundAt) {
      const k = c.firstInboundAt.toISOString().slice(0, 10);
      if (k in series) series[k]++;
    }
  }

  // KPIs
  const leadsTotal = convs30.length;
  const leadsPrev = convs30prev;
  const leadsGrowth = leadsPrev > 0 ? ((leadsTotal - leadsPrev) / leadsPrev) * 100 : 0;

  const spend = metaCurr._sum.spend ?? 0;
  const spendPrev = metaPrev._sum.spend ?? 0;
  const spendGrowth = spendPrev > 0 ? ((spend - spendPrev) / spendPrev) * 100 : 0;

  const metaLeads = metaCurr._sum.leads ?? 0;
  const cpl = metaLeads > 0 ? spend / metaLeads : 0;
  const cplPrev = (metaPrev._sum.leads ?? 0) > 0
    ? (metaPrev._sum.spend ?? 0) / (metaPrev._sum.leads ?? 1)
    : 0;
  const cplGrowth = cplPrev > 0 ? ((cpl - cplPrev) / cplPrev) * 100 : 0;

  const respondidos = convs30.filter((c) => c.firstResponseSec != null).length;
  const taxaAtendimento = leadsTotal > 0 ? (respondidos / leadsTotal) * 100 : 0;

  const responseTimes = convs30
    .filter((c): c is typeof c & { firstResponseSec: number } => c.firstResponseSec != null)
    .map((c) => c.firstResponseSec);
  const avgResponseSec =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
  const avgResponseMin = Math.round(avgResponseSec / 60);

  const negociacoes = convs30.filter(
    (c) => c.funnelStage === "negociacao" || c.funnelStage === "qualificado"
  ).length;
  const vendas = convs30.filter((c) => c.funnelStage === "convertido").length;

  await logPortalAccess(session.clientId, session.credentialId, "VIEW_DASHBOARD", req);

  return NextResponse.json({
    kpis: {
      leadsTotal,
      leadsGrowth: parseFloat(leadsGrowth.toFixed(1)),
      leads7d: convs7,
      investment: parseFloat(spend.toFixed(2)),
      investmentGrowth: parseFloat(spendGrowth.toFixed(1)),
      cpl: parseFloat(cpl.toFixed(2)),
      cplGrowth: parseFloat(cplGrowth.toFixed(1)),
      taxaAtendimento: parseFloat(taxaAtendimento.toFixed(1)),
      avgResponseMin,
      avgResponseSec,
      negociacoes,
      vendas,
    },
    series: Object.entries(series).map(([date, leads]) => ({ date, leads })),
  });
}
