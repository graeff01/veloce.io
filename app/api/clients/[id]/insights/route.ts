import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { computeExecutiveReport } from "@/lib/executive-report";
import { computeMetaAdsView } from "@/lib/meta-ads-view";
import { buildInsights } from "@/lib/insights-engine";
import { buildNarrative } from "@/lib/insights-narrative";

export const runtime = "nodejs";

// GET /api/clients/[id]/insights?year=&month=  → { insights[], narrative }
// Co-piloto de operação: alertas determinísticos + leitura executiva (IA opcional).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd = start;

  const [report, adsCur, adsPrev] = await Promise.all([
    computeExecutiveReport(id, year, month),
    computeMetaAdsView(id, start, end),
    computeMetaAdsView(id, prevStart, prevEnd),
  ]);

  if (!report) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const insights = buildInsights({ report, adsCur, adsPrev });
  const narrative = await buildNarrative(insights, report);

  return NextResponse.json({ insights, narrative, period: { year, month } });
}
