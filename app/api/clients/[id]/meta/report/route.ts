import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { renderToBuffer } from "@react-pdf/renderer";
import { computeMetaAdsView } from "@/lib/meta-ads-view";
import { buildAdsReport, type AdsReportData } from "@/components/clients/ads-report-document";

export const runtime = "nodejs";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// GET /api/clients/[id]/meta/report?year=&month=  → PDF de performance de anúncios
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

  const [client, conn, view] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { name: true } }),
    prisma.metaConnection.findUnique({ where: { clientId: id }, select: { adAccountId: true, accountName: true } }),
    computeMetaAdsView(id, start, end),
  ]);

  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Pré-baixa os thumbnails dos criativos em base64 (data URI) — o react-pdf não
  // depende de rede no render e uma imagem que falhe não derruba o PDF.
  async function toDataUri(u: string): Promise<string | null> {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "image/jpeg";
      if (!ct.startsWith("image/")) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1_500_000) return null; // não inflar o PDF
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch { return null; }
  }
  const thumbUrls = [...new Set(view.ads.map((a) => a.thumbnailUrl).filter((x): x is string => !!x))];
  const thumbPairs = await Promise.all(thumbUrls.map(async (u) => [u, await toDataUri(u)] as const));
  const thumbMap = new Map(thumbPairs);

  const data: AdsReportData = {
    clientName: client.name,
    accountName: conn?.accountName ?? conn?.adAccountId ?? null,
    periodLabel: `${MONTHS[month - 1]} de ${year}`,
    generatedAt: now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    totals: {
      spend: view.totals.spend,
      impressions: view.totals.impressions,
      clicks: view.totals.clicks,
      ctr: view.totals.ctr,
      cpc: view.totals.cpc,
      leads: view.totals.leads,
      cpl: view.totals.cpl,
    },
    campaigns: view.campaigns.map((c) => ({
      name: c.name,
      status: c.status,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      cpc: 0,
      leads: c.leads,
      cpl: c.cpl,
    })),
    ads: view.ads.map((a) => ({
      name: a.name,
      sub: a.campaignName,
      status: a.status,
      spend: a.spend,
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.ctr,
      cpc: a.cpc,
      leads: a.leads,
      cpl: a.cpl,
      thumb: a.thumbnailUrl ? (thumbMap.get(a.thumbnailUrl) ?? null) : null,
    })),
    campaignsCount: view.campaigns.length,
    adsCount: view.ads.length,
  };

  const buffer = await renderToBuffer(buildAdsReport(data));
  const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fileName = `relatorio-anuncios-${slug}-${year}-${String(month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
