import { prisma } from "@/lib/prisma";
import { canonicalAdName } from "@/lib/wa-leads";
import { onlyDigits } from "@/lib/whatsapp";
import { excludedTokens, nameExcluded } from "@/lib/notifications/client-bot";

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
  // ── Inteligência (campos sincronizados da Meta) ──
  startedAt: string | null;       // created_time (ISO) — idade do anúncio
  dailyBudget: number | null;     // orçamento/dia do conjunto (ou campanha)
  learningStage: string | null;   // LEARNING | LEARNING_LIMITED | SUCCESS
  frequency: number | null;       // frequência média no período (saturação)
  whatsappNumber: string | null;  // nº de destino CTWA (quando o criativo expõe)
  destinationType: string | null; // destino do clique (WHATSAPP, INSTAGRAM_PROFILE, ...)
  thumbnailUrl: string | null;     // imagem do criativo (anúncio)
  qualityRanking: string | null;
  engagementRanking: string | null;
  conversionRanking: string | null;
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
  startedAt: string | null;       // created_time (ISO) — idade da campanha
  dailyBudget: number | null;     // orçamento/dia (CBO)
  lifetimeBudget: number | null;  // orçamento total (CBO)
}

export interface MetaAdsView {
  connected: boolean;
  hasData: boolean;
  totals: { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; leads: number; metaLeads: number; cpl: number | null };
  campaigns: CampaignRow[];
  ads: AdRow[];
  leadsSemIdentificacao: number; // leads de anúncio que não casaram com nenhuma campanha
  connectedNumber: string | null; // nº WhatsApp conectado (p/ comparar com destino do anúncio)
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
  const [metaConn, waConn, excl] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }),
    prisma.waConnection.findUnique({ where: { clientId }, select: { id: true, displayPhone: true } }),
    excludedTokens(clientId),
  ]);

  const connectedNumber = waConn?.displayPhone ? onlyDigits(waConn.displayPhone) : null;
  if (!metaConn) return { connected: false, hasData: false, totals: EMPTY_TOTALS, campaigns: [], ads: [], leadsSemIdentificacao: 0, connectedNumber };

  const [insightRows, ads, campaigns, adsets, leadsRaw] = await Promise.all([
    prisma.metaAdInsight.groupBy({
      by: ["adId"],
      where: { connectionId: metaConn.id, date: { gte: start, lt: end } },
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
      _avg: { frequency: true },
    }),
    prisma.metaAd.findMany({
      where: { connectionId: metaConn.id },
      select: {
        adId: true, name: true, campaignId: true, adsetId: true, creativeId: true, status: true, startedAt: true,
        whatsappNumber: true, qualityRanking: true, engagementRanking: true, conversionRanking: true,
      },
    }),
    prisma.metaCampaign.findMany({
      where: { connectionId: metaConn.id },
      select: { campaignId: true, name: true, status: true, startedAt: true, dailyBudget: true, lifetimeBudget: true },
    }),
    prisma.metaAdSet.findMany({
      where: { connectionId: metaConn.id },
      select: { adsetId: true, learningStage: true, dailyBudget: true, lifetimeBudget: true, destinationType: true },
    }),
    // TODOS os leads de anúncio do período (com ou sem ad_id)
    waConn
      ? prisma.waLead.findMany({
          where: { connectionId: waConn.id, enteredAt: { gte: start, lt: end } },
          select: { adId: true, adModel: true, adTitle: true, name: true },
        })
      : Promise.resolve([] as { adId: string | null; adModel: string | null; adTitle: string | null; name: string | null }[]),
  ]);

  // Exclui donos/diretoria/família — não são leads (coerência com Painel/Diagnóstico).
  const leads = leadsRaw.filter((l) => !nameExcluded(l.name, excl));

  const adMeta = new Map(ads.map((a) => [a.adId, a]));
  const campMeta = new Map(campaigns.map((c) => [c.campaignId, c]));
  const adsetMeta = new Map(adsets.map((s) => [s.adsetId, s]));

  // Thumbnail do criativo por anúncio (imagem do anúncio).
  const creativeIds = [...new Set(ads.map((a) => a.creativeId).filter((x): x is string => !!x))];
  const creatives = creativeIds.length
    ? await prisma.metaCreative.findMany({ where: { connectionId: metaConn.id, creativeId: { in: creativeIds } }, select: { creativeId: true, thumbnailUrl: true } })
    : [];
  const thumbByCreative = new Map(creatives.map((c) => [c.creativeId, c.thumbnailUrl]));
  const campNorm = campaigns.map((c) => ({ campaignId: c.campaignId, key: norm(c.name) }));
  const adsByCampaign = new Map<string, string[]>();
  for (const a of ads) {
    const arr = adsByCampaign.get(a.campaignId) ?? [];
    arr.push(a.adId);
    adsByCampaign.set(a.campaignId, arr);
  }

  const spendByAd = new Map<string, { spend: number; impressions: number; clicks: number; metaLeads: number; frequency: number | null }>();
  for (const r of insightRows) {
    spendByAd.set(r.adId, { spend: r._sum.spend ?? 0, impressions: r._sum.impressions ?? 0, clicks: r._sum.clicks ?? 0, metaLeads: r._sum.leads ?? 0, frequency: r._avg.frequency ?? null });
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
    const adset = m?.adsetId ? adsetMeta.get(m.adsetId) : null;
    adRows.push({
      adId,
      name: m?.name ?? "Anúncio não sincronizado",
      campaignId,
      campaignName: campMeta.get(campaignId)?.name ?? "—",
      status: m?.status ?? "UNKNOWN",
      spend, impressions, clicks, metaLeads: sp?.metaLeads ?? 0, leads: leadCount,
      ctr: r.ctr, cpc: r.cpc, cpl: r.cpl,
      startedAt: m?.startedAt ? m.startedAt.toISOString() : null,
      dailyBudget: adset?.dailyBudget ?? campMeta.get(campaignId)?.dailyBudget ?? null,
      learningStage: adset?.learningStage ?? null,
      frequency: sp?.frequency ?? null,
      whatsappNumber: m?.whatsappNumber ?? null,
      destinationType: adset?.destinationType ?? null,
      thumbnailUrl: m?.creativeId ? (thumbByCreative.get(m.creativeId) ?? null) : null,
      qualityRanking: m?.qualityRanking ?? null,
      engagementRanking: m?.engagementRanking ?? null,
      conversionRanking: m?.conversionRanking ?? null,
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
    const cm = campMeta.get(campaignId);
    campaignRows.push({
      campaignId,
      name: cm?.name ?? "Campanha não sincronizada",
      status: cm?.status ?? "UNKNOWN",
      spend, impressions, clicks, metaLeads, leads: leadCount,
      ctr: r.ctr, cpl: r.cpl,
      startedAt: cm?.startedAt ? cm.startedAt.toISOString() : null,
      dailyBudget: cm?.dailyBudget ?? null,
      lifetimeBudget: cm?.lifetimeBudget ?? null,
    });
  }
  campaignRows.sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  // ── Totais ──
  let spend = 0, impressions = 0, clicks = 0, leadAttributed = 0, metaLeads = 0;
  for (const a of adRows) { spend += a.spend; impressions += a.impressions; clicks += a.clicks; metaLeads += a.metaLeads; }
  for (const c of campaignRows) leadAttributed += c.leads;
  // TOTAL de leads de anúncio = atribuídos + sem identificação (= todos os WaLead do
  // período). Coerente com o Painel; o CPL usa o total. As linhas por campanha
  // mostram só os atribuídos (a diferença = leadsSemIdentificacao, explicada na nota).
  const leadTotal = leadAttributed + semIdentificacao;
  const tr = ratios(spend, impressions, clicks, leadTotal);

  return {
    connected: true,
    hasData: campaignRows.length > 0,
    totals: { spend, impressions, clicks, ctr: tr.ctr, cpc: tr.cpc, leads: leadTotal, metaLeads, cpl: tr.cpl },
    campaigns: campaignRows,
    ads: adRows,
    leadsSemIdentificacao: semIdentificacao,
    connectedNumber,
  };
}
