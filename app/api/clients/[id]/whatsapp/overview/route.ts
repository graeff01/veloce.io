import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { computeOverview, WA_THRESHOLDS } from "@/lib/wa-metrics";
import { computeCplByModel } from "@/lib/wa-cpl";
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

  const cpl = await computeCplByModel(id, overview.byAd);

  // Campanhas com leads (best-effort): nomes de campanha do Meta que casam com
  // os modelos de anúncio que geraram lead no período.
  let campaignsWithLeads = 0;
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
