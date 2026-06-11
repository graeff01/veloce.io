import { prisma } from "@/lib/prisma";
import { canonicalAdName } from "@/lib/wa-leads";

// ── Visão "Gerenciador enxuto" da aba Anúncios ──────────────────────────────
// Cruza investimento (Meta, por ad_id) com o comportamento REAL do lead no
// WhatsApp/CRM. Leads reais > números modelados da Meta.
//
// Atribuição de cada lead à campanha/anúncio:
//   1) ad_id capturado no referral (determinístico) → anúncio exato.
//   2) sem ad_id (ex.: importado do Kommo) → casa o modelo do anúncio
//      (canonicalAdName) com o nome da CAMPANHA sincronizada. Se a campanha
//      tem um único anúncio, o lead também é creditado a esse anúncio.
//   3) sem casar → "sem identificação" (nunca é inventado).

export interface AdRow {
  adId: string;
  name: string;
  campaignId: string;
  campaignName: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  leads: number;     // leads reais (WhatsApp), por ad_id + rollup de campanha de 1 anúncio
  metaLeads: number;
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
  leads: number;     // leads reais atribuídos à campanha (ad_id + nome)
  metaLeads: number;
  cpl: number | null;
}

export interface MetaAdsView {
  connected: boolean;
  hasData: boolean;
  totals: { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; leads: number; metaLeads: number; cpl: number | null };
  campaigns: CampaignRow[];
  ads: AdRow[];
  leadsSemIdentificacao: number; // leads de anúncio que não casaram com nenhuma campanha
}

const EMPTY_TOTALS = { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, leads: 0, metaLeads: 0, cpl: null };

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function ratios(spend: number, impressions: number, clicks: number, leads: number) {
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpl: leads > 0 && spend > 0 ? spend / leads : null,
  };
}

export async function computeMetaAdsView(clientId: string, start: Date, end: Date): Promise<MetaAdsView> {
  const [metaConn, waConn] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }),
    prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } }),
  ]);

  if (!metaConn) return { connected: false, hasData: false, totals: EMPTY_TOTALS, campaigns: [], ads: [], leadsSemIdentificacao: 0 };

  const [insightRows, ads, campaigns, leads] = await Promise.all([
    prisma.metaAdInsight.groupBy({
      by: ["adId"],
      where: { connectionId: metaConn.id, date: { gte: start, lt: end } },
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
    }),
    prisma.metaAd.findMany({ where: { connectionId: metaConn.id }, select: { adId: true, name: true, campaignId: true, status: true } }),
    prisma.metaCampaign.findMany({ where: { connectionId: metaConn.id }, select: { campaignId: true, name: true, status: true } }),
    // TODOS os leads de anúncio do período (com ou sem ad_id)
    waConn
      ? prisma.waLead.findMany({
          where: { connectionId: waConn.id, enteredAt: { gte: start, lt: end } },
          select: { adId: true, adModel: true, adTitle: true },
        })
      : Promise.resolve([] as { adId: string | null; adModel: string | null; adTitle: string | null }[]),
  ]);

  const adMeta = new Map(ads.map((a) => [a.adId, a]));
  const campMeta = new Map(campaigns.map((c) => [c.campaignId, c]));
  const campNorm = campaigns.map((c) => ({ campaignId: c.campaignId, key: norm(c.name) }));
  const adsByCampaign = new Map<string, string[]>();
  for (const a of ads) {
    const arr = adsByCampaign.get(a.campaignId) ?? [];
    arr.push(a.adId);
    adsByCampaign.set(a.campaignId, arr);
  }

  const spendByAd = new Map<string, { spend: number; impressions: number; clicks: number; metaLeads: number }>();
  for (const r of insightRows) {
    spendByAd.set(r.adId, { spend: r._sum.spend ?? 0, impressions: r._sum.impressions ?? 0, clicks: r._sum.clicks ?? 0, metaLeads: r._sum.leads ?? 0 });
  }

  // ── Atribuição dos leads reais ──
  const leadsByAd = new Map<string, number>();        // ad_id → leads (determinístico)
  const leadsByCampaignName = new Map<string, number>(); // campaignId → leads casados por nome (sem ad_id)
  let semIdentificacao = 0;

  // Casa o modelo de um lead sem ad_id com UMA campanha (nome). 0 ou >1 → não atribui.
  function matchCampaign(model: string | null, title: string | null): string | null {
    const key = norm(canonicalAdName(model, title));
    if (key.length < 4) return null;
    const hits = campNorm.filter((c) => c.key && (c.key.includes(key) || key.includes(c.key)));
    return hits.length === 1 ? hits[0].campaignId : null;
  }

  for (const l of leads) {
    if (l.adId && adMeta.has(l.adId)) {
      leadsByAd.set(l.adId, (leadsByAd.get(l.adId) ?? 0) + 1);
    } else {
      const campaignId = matchCampaign(l.adModel, l.adTitle);
      if (campaignId) leadsByCampaignName.set(campaignId, (leadsByCampaignName.get(campaignId) ?? 0) + 1);
      else semIdentificacao++;
    }
  }

  // ── Linhas por anúncio ──
  // Anúncios com gasto OU com lead por ad_id. Leads de nome entram no anúncio
  // só quando a campanha tem um único anúncio (não dá pra desambiguar com vários).
  const adIds = new Set<string>([...spendByAd.keys(), ...leadsByAd.keys()]);
  const adRows: AdRow[] = [];
  for (const adId of adIds) {
    const sp = spendByAd.get(adId);
    const m = adMeta.get(adId);
    const campaignId = m?.campaignId ?? "—";
    const onlyAdInCampaign = (adsByCampaign.get(campaignId)?.length ?? 0) === 1;
    const nameLeads = onlyAdInCampaign ? (leadsByCampaignName.get(campaignId) ?? 0) : 0;
    const leadCount = (leadsByAd.get(adId) ?? 0) + nameLeads;
    const spend = sp?.spend ?? 0, impressions = sp?.impressions ?? 0, clicks = sp?.clicks ?? 0;
    const r = ratios(spend, impressions, clicks, leadCount);
    adRows.push({
      adId,
      name: m?.name ?? "Anúncio não sincronizado",
      campaignId,
      campaignName: campMeta.get(campaignId)?.name ?? "—",
      status: m?.status ?? "UNKNOWN",
      spend, impressions, clicks, metaLeads: sp?.metaLeads ?? 0, leads: leadCount,
      ctr: r.ctr, cpc: r.cpc, cpl: r.cpl,
    });
  }
  adRows.sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  // ── Linhas por campanha ──
  const campIds = new Set<string>([
    ...adRows.map((a) => a.campaignId),
    ...leadsByCampaignName.keys(),
  ]);
  const campaignRows: CampaignRow[] = [];
  for (const campaignId of campIds) {
    const adsOfCamp = adRows.filter((a) => a.campaignId === campaignId);
    const spend = adsOfCamp.reduce((s, a) => s + a.spend, 0);
    const impressions = adsOfCamp.reduce((s, a) => s + a.impressions, 0);
    const clicks = adsOfCamp.reduce((s, a) => s + a.clicks, 0);
    const metaLeads = adsOfCamp.reduce((s, a) => s + a.metaLeads, 0);
    // leads da campanha = leads por ad_id dos seus anúncios + leads casados por nome
    const adIdLeads = adsOfCamp.reduce((s, a) => s + (leadsByAd.get(a.adId) ?? 0), 0);
    const leadCount = adIdLeads + (leadsByCampaignName.get(campaignId) ?? 0);
    const r = ratios(spend, impressions, clicks, leadCount);
    campaignRows.push({
      campaignId,
      name: campMeta.get(campaignId)?.name ?? "Campanha não sincronizada",
      status: campMeta.get(campaignId)?.status ?? "UNKNOWN",
      spend, impressions, clicks, metaLeads, leads: leadCount,
      ctr: r.ctr, cpl: r.cpl,
    });
  }
  campaignRows.sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  // ── Totais ──
  let spend = 0, impressions = 0, clicks = 0, leadTotal = 0, metaLeads = 0;
  for (const a of adRows) { spend += a.spend; impressions += a.impressions; clicks += a.clicks; metaLeads += a.metaLeads; }
  for (const c of campaignRows) leadTotal += c.leads;
  const tr = ratios(spend, impressions, clicks, leadTotal);

  return {
    connected: true,
    hasData: campaignRows.length > 0,
    totals: { spend, impressions, clicks, ctr: tr.ctr, cpc: tr.cpc, leads: leadTotal, metaLeads, cpl: tr.cpl },
    campaigns: campaignRows,
    ads: adRows,
    leadsSemIdentificacao: semIdentificacao,
  };
}
