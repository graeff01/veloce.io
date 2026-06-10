import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;
  const { session } = auth;

  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const metaConn = await prisma.metaConnection.findUnique({
    where: { clientId: session.clientId },
  });

  // Agrupar insights por campanha (últimos 30 dias)
  const insights = await prisma.metaInsight.groupBy({
    by: ["campaignId", "campaignName", "status"],
    where: {
      connectionId: metaConn?.id ?? "",
      dateStart: { gte: d30 },
    },
    _sum: { spend: true, leads: true },
    orderBy: { _sum: { leads: "desc" } },
    take: 20,
  });

  const campanhas = insights.map((row) => {
    const spend = row._sum.spend ?? 0;
    const leads = row._sum.leads ?? 0;
    const cpl = leads > 0 ? spend / leads : 0;
    return {
      id: row.campaignId,
      name: row.campaignName,
      status: row.status,
      leads,
      investimento: parseFloat(spend.toFixed(2)),
      cpl: parseFloat(cpl.toFixed(2)),
    };
  });

  await logPortalAccess(session.clientId, session.credentialId, "VIEW_CAMPANHAS", req);

  return NextResponse.json({ campanhas });
}
