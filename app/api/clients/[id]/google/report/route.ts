import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildGoogleReport, type GoogleReportData } from "@/components/clients/google-report-document";
import { computeWaste, accountHealth } from "@/lib/google-ads/audit";

export const runtime = "nodejs";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// GET /api/clients/[id]/google/report?year=&month=  → PDF de performance + auditoria do Google
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;

  const [client, conn] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { name: true } }),
    prisma.googleConnection.findUnique({
      where: { clientId: id },
      include: {
        campaigns: { orderBy: { spend: "desc" } },
        searchTerms: { orderBy: { spend: "desc" }, take: 30 },
        keywords: { orderBy: { spend: "desc" }, take: 30 },
        diagnostics: { orderBy: { createdAt: "desc" } },
        changeEvents: { orderBy: { changedAt: "desc" }, take: 20 },
        insights: { orderBy: { date: "asc" } },
      },
    }),
  ]);

  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!conn) return NextResponse.json({ error: "Cliente sem conexão Google" }, { status: 404 });

  const totals = conn.campaigns.reduce(
    (a, c) => ({ spend: a.spend + c.spend, impressions: a.impressions + c.impressions, clicks: a.clicks + c.clicks, conversions: a.conversions + c.conversions }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  const withIs = conn.campaigns.filter((c) => c.impressionShare != null && c.impressions > 0);
  const wImp = withIs.reduce((s, c) => s + c.impressions, 0);
  const impressionShare = wImp > 0 ? withIs.reduce((s, c) => s + (c.impressionShare ?? 0) * c.impressions, 0) / wImp : null;

  const waste = computeWaste(conn.searchTerms);
  const wasteRatio = totals.spend > 0 ? waste.amount / totals.spend : 0;
  const health = accountHealth({ impressionShare, wasteRatio, diagnostics: conn.diagnostics });

  // Deltas (metade recente vs anterior do histórico diário)
  const ins = conn.insights;
  let deltas: GoogleReportData["deltas"] = null;
  if (ins.length >= 4) {
    const half = Math.floor(ins.length / 2);
    const prev = ins.slice(0, half), recent = ins.slice(ins.length - half);
    const sum = (a: typeof ins, k: "spend" | "conversions" | "clicks" | "impressions") => a.reduce((s, x) => s + (x[k] as number), 0);
    const pc = (r: number, p: number) => (p > 0 ? Math.round(((r - p) / p) * 100) : null);
    deltas = {
      spend: pc(sum(recent, "spend"), sum(prev, "spend")),
      conversions: pc(sum(recent, "conversions"), sum(prev, "conversions")),
      clicks: pc(sum(recent, "clicks"), sum(prev, "clicks")),
      impressions: pc(sum(recent, "impressions"), sum(prev, "impressions")),
    };
  }

  const data: GoogleReportData = {
    clientName: client.name,
    accountName: conn.accountName ?? conn.customerId,
    periodLabel: `${MONTHS[month - 1]} de ${year}`,
    generatedAt: now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    health: { score: health.score, label: health.label, factors: health.factors },
    totals,
    deltas,
    impressionShare,
    waste,
    campaigns: conn.campaigns.map((c) => ({ name: c.name, status: c.status, spend: c.spend, conversions: c.conversions, impressionShare: c.impressionShare })),
    searchTerms: conn.searchTerms.map((x) => ({ term: x.term, spend: x.spend, conversions: x.conversions })),
    keywords: conn.keywords.map((k) => ({ keyword: k.keyword, spend: k.spend, conversions: k.conversions, qualityScore: k.qualityScore })),
    diagnostics: conn.diagnostics.map((d) => ({ severity: d.severity, title: d.title, detail: d.detail })),
    changes: conn.changeEvents.map((c) => ({ changedAt: c.changedAt.toISOString(), userEmail: c.userEmail, summary: c.summary })),
  };

  const buffer = await renderToBuffer(buildGoogleReport(data));
  const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fileName = `relatorio-google-${slug}-${year}-${String(month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"` },
  });
}
