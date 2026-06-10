import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";

type Period = "7d" | "30d" | "90d";

function periodDays(p: Period): number {
  return p === "7d" ? 7 : p === "30d" ? 30 : 90;
}

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;
  const { session } = auth;

  const url = new URL(req.url);
  const rawPeriod = url.searchParams.get("periodo") ?? "30d";
  const period: Period = ["7d", "30d", "90d"].includes(rawPeriod)
    ? (rawPeriod as Period)
    : "30d";

  const days = periodDays(period);
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [waConn, metaConn] = await Promise.all([
    prisma.waConnection.findUnique({ where: { clientId: session.clientId } }),
    prisma.metaConnection.findUnique({ where: { clientId: session.clientId } }),
  ]);

  // Inicializar série diária
  const leadsMap: Record<string, number> = {};
  const spendMap: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    leadsMap[k] = 0;
    spendMap[k] = 0;
  }

  // Leads por dia via WaConversation
  const convs = await prisma.waConversation.findMany({
    where: {
      connectionId: waConn?.id ?? "",
      firstInboundAt: { gte: start },
    },
    select: { firstInboundAt: true },
  });
  for (const c of convs) {
    if (!c.firstInboundAt) continue;
    const k = c.firstInboundAt.toISOString().slice(0, 10);
    if (k in leadsMap) leadsMap[k]++;
  }

  // Investimento por dia via MetaInsight
  const insights = await prisma.metaInsight.findMany({
    where: {
      connectionId: metaConn?.id ?? "",
      dateStart: { gte: start },
    },
    select: { dateStart: true, spend: true },
  });
  for (const ins of insights) {
    const k = ins.dateStart.toISOString().slice(0, 10);
    if (k in spendMap) spendMap[k] += ins.spend;
  }

  // Montar série unificada
  const series = Object.keys(leadsMap).map((date) => {
    const leads = leadsMap[date] ?? 0;
    const investimento = parseFloat((spendMap[date] ?? 0).toFixed(2));
    const cpl = leads > 0 ? parseFloat((investimento / leads).toFixed(2)) : 0;
    return { date, leads, investimento, cpl };
  });

  // Totais
  const totalLeads = series.reduce((s, r) => s + r.leads, 0);
  const totalSpend = series.reduce((s, r) => s + r.investimento, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  await logPortalAccess(session.clientId, session.credentialId, "VIEW_EVOLUCAO", req);

  return NextResponse.json({
    period,
    series,
    totais: {
      leads: totalLeads,
      investimento: parseFloat(totalSpend.toFixed(2)),
      cpl: parseFloat(avgCpl.toFixed(2)),
    },
  });
}
