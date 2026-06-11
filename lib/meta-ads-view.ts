import { prisma } from "@/lib/prisma";

// ── Visão "Gerenciador enxuto" da aba Anúncios ──────────────────────────────
// Campanhas e anúncios com as métricas que importam, vindos das tabelas
// dimensionais (MetaAd/MetaAdInsight/MetaCampaign) + LEADS REAIS do WhatsApp
// (WaLead por ad_id). Mesma fonte do Ads Intelligence — 100% por ID, sem nome.

export interface AdRow {
  adId: string;
  name: string;
  campaignName: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;       // %
  cpc: number;
  cpm: number;
  leads: number;     // leads reais (WhatsApp)
  metaLeads: number; // leads reportados pela Meta
  cpl: number | null;
}

export interface CampaignRow {
  campaignId: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  metaLeads: number;
  cpl: number | null;
}

export interface MetaAdsView {
  connected: boolean;
  hasData: boolean;
  totals: { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; leads: number; metaLeads: number; cpl: number | null };
  campaigns: CampaignRow[];
  ads: AdRow[];
}

const EMPTY_TOTALS = { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, leads: 0, metaLeads: 0, cpl: null };

function ratios(spend: number, impressions: number, clicks: number, leads: number) {
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpl: leads > 0 && spend > 0 ? spend / leads : null,
  };
}

export async function computeMetaAdsView(clientId: string, start: Date, end: Date): Promise<MetaAdsView> {
  const [metaConn, waConn] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }),
    prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } }),
  ]);

  if (!metaConn) return { connected: false, hasData: false, totals: EMPTY_TOTALS, campaigns: [], ads: [] };

  const [insightRows, ads, campaigns, leadRows] = await Promise.all([
    prisma.metaAdInsight.groupBy({
      by: ["adId"],
      where: { connectionId: metaConn.id, date: { gte: start, lt: end } },
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
    }),
    prisma.metaAd.findMany({ where: { connectionId: metaConn.id }, select: { adId: true, name: true, campaignId: true, status: true } }),
    prisma.metaCampaign.findMany({ where: { connectionId: metaConn.id }, select: { campaignId: true, name: true, status: true } }),
    waConn
      ? prisma.waLead.groupBy({
          by: ["adId"],
          where: { connectionId: waConn.id, adId: { not: null }, enteredAt: { gte: start, lt: end } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { adId: string | null; _count: { _all: number } }[]),
  ]);

  const adMeta = new Map(ads.map((a) => [a.adId, a]));
  const campMeta = new Map(campaigns.map((c) => [c.campaignId, c]));
  const leadsByAd = new Map<string, number>();
  for (const r of leadRows) if (r.adId) leadsByAd.set(r.adId, r._count._all);

  // Considera anúncios com gasto OU com lead real no período
  const adIds = new Set<string>([...insightRows.map((r) => r.adId), ...leadsByAd.keys()]);

  const adRows: AdRow[] = [];
  const campAgg = new Map<string, { spend: number; impressions: number; clicks: number; leads: number; metaLeads: number }>();

  for (const adId of adIds) {
    const ins = insightRows.find((r) => r.adId === adId);
    const spend = ins?._sum.spend ?? 0;
    const impressions = ins?._sum.impressions ?? 0;
    const clicks = ins?._sum.clicks ?? 0;
    const metaLeads = ins?._sum.leads ?? 0;
    const leads = leadsByAd.get(adId) ?? 0;
    const m = adMeta.get(adId);
    const campaignId = m?.campaignId ?? "—";
    const r = ratios(spend, impressions, clicks, leads);

    adRows.push({
      adId,
      name: m?.name ?? "Anúncio não sincronizado",
      campaignName: campMeta.get(campaignId)?.name ?? "—",
      status: m?.status ?? "UNKNOWN",
      spend, impressions, clicks, metaLeads, leads,
      ctr: r.ctr, cpc: r.cpc, cpm: r.cpm, cpl: r.cpl,
    });

    const a = campAgg.get(campaignId) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0, metaLeads: 0 };
    a.spend += spend; a.impressions += impressions; a.clicks += clicks; a.leads += leads; a.metaLeads += metaLeads;
    campAgg.set(campaignId, a);
  }

  adRows.sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  const campaignRows: CampaignRow[] = [...campAgg.entries()].map(([campaignId, v]) => {
    const r = ratios(v.spend, v.impressions, v.clicks, v.leads);
    return {
      campaignId,
      name: campMeta.get(campaignId)?.name ?? "Campanha não sincronizada",
      status: campMeta.get(campaignId)?.status ?? "UNKNOWN",
      spend: v.spend, impressions: v.impressions, clicks: v.clicks,
      ctr: r.ctr, leads: v.leads, metaLeads: v.metaLeads, cpl: r.cpl,
    };
  }).sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  // Totais
  let spend = 0, impressions = 0, clicks = 0, leads = 0, metaLeads = 0;
  for (const a of adRows) { spend += a.spend; impressions += a.impressions; clicks += a.clicks; leads += a.leads; metaLeads += a.metaLeads; }
  const tr = ratios(spend, impressions, clicks, leads);

  return {
    connected: true,
    hasData: adRows.length > 0,
    totals: { spend, impressions, clicks, ctr: tr.ctr, cpc: tr.cpc, leads, metaLeads, cpl: tr.cpl },
    campaigns: campaignRows,
    ads: adRows,
  };
}
