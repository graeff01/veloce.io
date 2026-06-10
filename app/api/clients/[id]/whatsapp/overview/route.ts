import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { computeOverview, WA_THRESHOLDS } from "@/lib/wa-metrics";
import { computeCplByModel } from "@/lib/wa-cpl";
import { computeRealAttribution } from "@/lib/meta-attribution";
import { closeInactiveConversations } from "@/lib/wa-conversation";

// GET — visão geral da operação no período + comparativo com o período anterior
// + CPL real (gasto Meta × leads reais). Parâmetros: ?from=&to= (ISO) ou ?year=&month=
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let start: Date, end: Date;
  if (fromParam && toParam) {
    start = new Date(fromParam);
    end = new Date(toParam);
  } else {
    const now = new Date();
    const year = Number(url.searchParams.get("year")) || now.getFullYear();
    const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 1);
  }

  // Período anterior (mesma duração) para o comparativo
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = start;
  const prevStart = new Date(start.getTime() - durationMs);

  // Mantém o rótulo "closed" fresco sem depender de cron (updateMany indexado).
  await closeInactiveConversations(conn.id, WA_THRESHOLDS.closeAfterHours);

  const [overview, prev] = await Promise.all([
    computeOverview(conn.id, start, end),
    computeOverview(conn.id, prevStart, prevEnd),
  ]);

  // CPL: PREFERE atribuição determinística por ad_id (MetaAd/MetaAdInsight ×
  // WaLead.adId). Só cai no match por nome (legado) se a estrutura ad-level
  // ainda não foi sincronizada.
  const metaConn = await prisma.metaConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  const adCount = metaConn ? await prisma.metaAd.count({ where: { connectionId: metaConn.id } }) : 0;

  let cpl: Awaited<ReturnType<typeof computeCplByModel>>;
  let campaignsWithLeads = 0;

  if (metaConn && adCount > 0) {
    const attr = await computeRealAttribution(metaConn.id, conn.id, start, end);
    cpl = attr.porAnuncio
      .filter((a) => a.spend > 0 || a.leads > 0)
      .map((a) => ({
        model: a.name,
        realLeads: a.leads,
        spend: a.spend,
        cplReal: a.cpl,
        metaLeads: a.metaLeads,
        cplMeta: a.metaLeads > 0 && a.spend > 0 ? a.spend / a.metaLeads : null,
      }));
    campaignsWithLeads = attr.porCampanha.filter((c) => c.leads > 0).length;
  } else {
    // Fallback legado por nome (até o sync ad-level popular as tabelas)
    cpl = await computeCplByModel(id, overview.byAd);
    if (overview.byAd.length) {
      const meta = await prisma.metaConnection.findUnique({
        where: { clientId: id },
        include: { insights: { select: { campaignName: true, adsetName: true } } },
      }).catch(() => null);
      if (meta) {
        const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
        const names = new Set<string>();
        for (const a of overview.byAd) {
          const key = norm(a.adTitle);
          if (!key) continue;
          for (const ins of meta.insights) {
            const name = `${norm(ins.campaignName ?? "")} ${norm(ins.adsetName ?? "")}`;
            if (name.includes(key) && ins.campaignName) { names.add(ins.campaignName); break; }
          }
        }
        campaignsWithLeads = names.size;
      }
    }
  }

  return NextResponse.json({
    ...overview,
    cpl,
    campaignsWithLeads,
    previous: {
      leads: prev.leads,
      converted: prev.converted,
    },
  });
}
