import { prisma } from "@/lib/prisma";

// ── Atribuição determinística (IDs oficiais, nunca por nome) ─────────────────
//
//   Lead (WaLead.adId)  →  Anúncio (MetaAd)  →  Conjunto (MetaAdSet)
//                                            →  Campanha (MetaCampaign)
//                                            →  Criativo (MetaCreative)
//
// Imune a renomeação de campanha/conjunto/anúncio: a chave é sempre o ID.

export interface AdChain {
  adId: string;
  adName: string | null;
  adStatus: string | null;
  adset: { adsetId: string; name: string; status: string } | null;
  campaign: { campaignId: string; name: string; objective: string | null; status: string } | null;
  creative: { creativeId: string; name: string | null; title: string | null; thumbnailUrl: string | null } | null;
}

// Resolve a cadeia completa de um anúncio a partir do ad_id capturado no webhook.
export async function resolveAdChain(connectionId: string, adId: string): Promise<AdChain | null> {
  const ad = await prisma.metaAd.findUnique({
    where: { connectionId_adId: { connectionId, adId } },
  });
  if (!ad) return { adId, adName: null, adStatus: null, adset: null, campaign: null, creative: null };

  const [adset, campaign, creative] = await Promise.all([
    prisma.metaAdSet.findUnique({ where: { connectionId_adsetId: { connectionId, adsetId: ad.adsetId } } }),
    prisma.metaCampaign.findUnique({ where: { connectionId_campaignId: { connectionId, campaignId: ad.campaignId } } }),
    ad.creativeId
      ? prisma.metaCreative.findUnique({ where: { connectionId_creativeId: { connectionId, creativeId: ad.creativeId } } })
      : Promise.resolve(null),
  ]);

  return {
    adId,
    adName: ad.name,
    adStatus: ad.status,
    adset: adset ? { adsetId: adset.adsetId, name: adset.name, status: adset.status } : null,
    campaign: campaign ? { campaignId: campaign.campaignId, name: campaign.name, objective: campaign.objective, status: campaign.status } : null,
    creative: creative ? { creativeId: creative.creativeId, name: creative.name, title: creative.title, thumbnailUrl: creative.thumbnailUrl } : null,
  };
}

export interface CplByCampaign {
  campaignId: string;
  name: string;       // nome atual (display) — derivado do ID, não usado p/ casar
  status: string;
  spend: number;
  leads: number;      // leads REAIS (WhatsApp) atribuídos por ad_id
  metaLeads: number;  // leads que a Meta reporta (modelado) — referência
  cpl: number | null;
}

export interface CplByAd {
  adId: string;
  name: string;
  campaignId: string;
  spend: number;
  leads: number;      // leads REAIS (WhatsApp)
  metaLeads: number;  // leads reportados pela Meta
  cpl: number | null;
}

// Resolve o nome ATUAL da campanha de cada ad_id (display), por ID — não por
// nome. Retorna Map<adId, { campaignId, campaignName, adName }>. Vazio quando a
// estrutura ainda não foi sincronizada (chamador usa fallback).
export async function resolveCampaignByAdIds(
  connectionId: string,
  adIds: string[],
): Promise<Map<string, { campaignId: string; campaignName: string; adName: string }>> {
  const out = new Map<string, { campaignId: string; campaignName: string; adName: string }>();
  const ids = [...new Set(adIds.filter(Boolean))];
  if (!ids.length) return out;

  const ads = await prisma.metaAd.findMany({
    where: { connectionId, adId: { in: ids } },
    select: { adId: true, name: true, campaignId: true },
  });
  if (!ads.length) return out;

  const campIds = [...new Set(ads.map((a) => a.campaignId))];
  const camps = await prisma.metaCampaign.findMany({
    where: { connectionId, campaignId: { in: campIds } },
    select: { campaignId: true, name: true },
  });
  const campName = new Map(camps.map((c) => [c.campaignId, c.name]));

  for (const a of ads) {
    out.set(a.adId, { campaignId: a.campaignId, campaignName: campName.get(a.campaignId) ?? a.name, adName: a.name });
  }
  return out;
}

export interface RealAttribution {
  investimento: number;        // soma de spend no período (todos os anúncios)
  adLeads: number;             // leads de anúncio reais (WaLead.adId != null)
  cplReal: number | null;      // investimento / adLeads
  porCampanha: CplByCampaign[];
  porAnuncio: CplByAd[];
  unmatchedLeads: number;      // leads com ad_id ainda sem MetaAd sincronizado
}

// CPL REAL: cruza gasto (MetaAdInsight por ad_id) × leads reais (WaLead por ad_id).
// 100% por ID. `start`/`end` é o intervalo [start, end). `waConnectionId` é a
// conexão WhatsApp do MESMO cliente (onde vivem os leads).
export async function computeRealAttribution(
  connectionId: string,
  waConnectionId: string | null,
  start: Date,
  end: Date,
): Promise<RealAttribution> {
  const [spendRows, ads, campaigns, leadRows] = await Promise.all([
    prisma.metaAdInsight.groupBy({
      by: ["adId"],
      where: { connectionId, date: { gte: start, lt: end } },
      _sum: { spend: true, leads: true },
    }),
    prisma.metaAd.findMany({ where: { connectionId }, select: { adId: true, name: true, campaignId: true } }),
    prisma.metaCampaign.findMany({ where: { connectionId }, select: { campaignId: true, name: true, status: true } }),
    waConnectionId
      ? prisma.waLead.groupBy({
          by: ["adId"],
          where: { connectionId: waConnectionId, adId: { not: null }, enteredAt: { gte: start, lt: end } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { adId: string | null; _count: { _all: number } }[]),
  ]);

  const adMeta = new Map(ads.map((a) => [a.adId, a]));
  const campMeta = new Map(campaigns.map((c) => [c.campaignId, c]));
  const spendByAd = new Map<string, number>();
  const metaLeadsByAd = new Map<string, number>();
  for (const r of spendRows) { spendByAd.set(r.adId, r._sum.spend ?? 0); metaLeadsByAd.set(r.adId, r._sum.leads ?? 0); }

  const leadsByAd = new Map<string, number>();
  for (const r of leadRows) if (r.adId) leadsByAd.set(r.adId, r._count._all);

  // Investimento = todo o gasto do período (todos os anúncios sincronizados)
  let investimento = 0;
  for (const v of spendByAd.values()) investimento += v;

  // Leads reais de anúncio
  let adLeads = 0;
  let unmatchedLeads = 0;
  for (const [adId, count] of leadsByAd) {
    adLeads += count;
    if (!adMeta.has(adId)) unmatchedLeads += count;
  }

  // Por anúncio
  const allAdIds = new Set<string>([...spendByAd.keys(), ...leadsByAd.keys()]);
  const porAnuncio: CplByAd[] = [];
  const campAgg = new Map<string, { spend: number; leads: number; metaLeads: number }>();
  for (const adId of allAdIds) {
    const spend = spendByAd.get(adId) ?? 0;
    const leads = leadsByAd.get(adId) ?? 0;
    const metaLeads = metaLeadsByAd.get(adId) ?? 0;
    const meta = adMeta.get(adId);
    const campaignId = meta?.campaignId ?? "—";
    porAnuncio.push({
      adId,
      name: meta?.name ?? "Anúncio não sincronizado",
      campaignId,
      spend,
      leads,
      metaLeads,
      cpl: leads > 0 && spend > 0 ? spend / leads : null,
    });
    const agg = campAgg.get(campaignId) ?? { spend: 0, leads: 0, metaLeads: 0 };
    agg.spend += spend;
    agg.leads += leads;
    agg.metaLeads += metaLeads;
    campAgg.set(campaignId, agg);
  }
  porAnuncio.sort((a, b) => b.leads - a.leads || b.spend - a.spend);

  const porCampanha: CplByCampaign[] = [...campAgg.entries()]
    .map(([campaignId, v]) => ({
      campaignId,
      name: campMeta.get(campaignId)?.name ?? "Campanha não sincronizada",
      status: campMeta.get(campaignId)?.status ?? "UNKNOWN",
      spend: v.spend,
      leads: v.leads,
      metaLeads: v.metaLeads,
      cpl: v.leads > 0 && v.spend > 0 ? v.spend / v.leads : null,
    }))
    .sort((a, b) => b.leads - a.leads || b.spend - a.spend);

  return {
    investimento,
    adLeads,
    cplReal: adLeads > 0 && investimento > 0 ? investimento / adLeads : null,
    porCampanha,
    porAnuncio,
    unmatchedLeads,
  };
}
