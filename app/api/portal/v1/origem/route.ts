import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;
  const { session } = auth;

  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [waConn, metaConn] = await Promise.all([
    prisma.waConnection.findUnique({ where: { clientId: session.clientId } }),
    prisma.metaConnection.findUnique({ where: { clientId: session.clientId } }),
  ]);

  const [metaAgg, paidLeads, organicLeads] = await Promise.all([
    // Meta Ads: investimento e leads rastreados
    prisma.metaInsight.aggregate({
      where: { connectionId: metaConn?.id ?? "", dateStart: { gte: d30 } },
      _sum: { spend: true, leads: true },
    }),
    // Leads via anúncio (com adId) no WhatsApp
    prisma.waLead.count({
      where: {
        connectionId: waConn?.id ?? "",
        enteredAt: { gte: d30 },
        adId: { not: null },
      },
    }),
    // Leads orgânicos (sem adId)
    prisma.waLead.count({
      where: {
        connectionId: waConn?.id ?? "",
        enteredAt: { gte: d30 },
        adId: null,
      },
    }),
  ]);

  const metaSpend = metaAgg._sum.spend ?? 0;
  const metaLeads = metaAgg._sum.leads ?? 0;
  const metaCpl = metaLeads > 0 ? metaSpend / metaLeads : 0;

  const total = paidLeads + organicLeads;

  function pct(n: number): number {
    return total > 0 ? parseFloat(((n / total) * 100).toFixed(1)) : 0;
  }

  await logPortalAccess(session.clientId, session.credentialId, "VIEW_ORIGEM", req);

  return NextResponse.json({
    total,
    origens: [
      {
        label: "Meta Ads",
        leads: paidLeads,
        percent: pct(paidLeads),
        investimento: parseFloat(metaSpend.toFixed(2)),
        cpl: parseFloat(metaCpl.toFixed(2)),
        color: "#3B82F6",
      },
      {
        label: "Orgânico / Direto",
        leads: organicLeads,
        percent: pct(organicLeads),
        investimento: 0,
        cpl: 0,
        color: "#10B981",
      },
    ],
  });
}
