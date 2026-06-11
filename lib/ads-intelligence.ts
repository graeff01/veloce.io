import { prisma } from "@/lib/prisma";

// ── Ads Intelligence ─────────────────────────────────────────────────────────
// Inteligência comercial a partir da mídia: cruza investimento (Meta, por ad_id)
// com o comportamento real do lead no WhatsApp/CRM (atendimento, negociação,
// conversão). Tudo por ID oficial — nunca por nome. Responde o que o Meta não
// responde: qual anúncio gera RESULTADO, não só clique.

export interface AdRow {
  adId: string;
  name: string;
  campaignId: string;
  campaignName: string;
  status: string;
  investimento: number;
  leads: number;          // oportunidades reais (WhatsApp)
  atendidos: number;
  negociacoes: number;
  conversoes: number;
  cpl: number | null;
  taxaConversao: number;  // 0..1
  resultado: "destaque" | "saudavel" | "atencao" | "desperdicio";
}

export interface CampaignRow {
  campaignId: string;
  name: string;
  status: string;
  investimento: number;
  leads: number;
  atendidos: number;
  negociacoes: number;
  conversoes: number;
  cpl: number | null;
  taxaConversao: number;
}

export interface AdsIntelligence {
  hasMeta: boolean;
  hasAdData: boolean;
  cards: {
    oportunidades: number;
    investimento: number;
    cplReal: number | null;
    conversoes: number;
    taxaConversao: number; // 0..1
  };
  funil: {
    impressoes: number;
    cliques: number;
    leads: number;
    atendidos: number;
    negociacoes: number;
    conversoes: number;
  };
  campanhas: CampaignRow[];
  anuncios: AdRow[];
  qualidade: { excelente: number; boa: number; media: number; baixa: number };
  insights: string[];
}

const STAGE_POINTS: Record<string, number> = {
  recebido: 10, respondido: 30, qualificado: 55, negociacao: 75, convertido: 100, perdido: 5,
};

function resultadoOf(leads: number, conversoes: number, taxa: number, cpl: number | null, medianCpl: number | null): AdRow["resultado"] {
  if (conversoes > 0 && taxa >= 0.15) return "destaque";
  if (leads >= 3 && conversoes === 0) return "desperdicio";
  if (medianCpl != null && cpl != null && cpl > medianCpl * 1.6) return "atencao";
  return "saudavel";
}

export async function computeAdsIntelligence(clientId: string, start: Date, end: Date): Promise<AdsIntelligence> {
  const [metaConn, waConn] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }),
    prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } }),
  ]);

  const empty: AdsIntelligence = {
    hasMeta: !!metaConn, hasAdData: false,
    cards: { oportunidades: 0, investimento: 0, cplReal: null, conversoes: 0, taxaConversao: 0 },
    funil: { impressoes: 0, cliques: 0, leads: 0, atendidos: 0, negociacoes: 0, conversoes: 0 },
    campanhas: [], anuncios: [], qualidade: { excelente: 0, boa: 0, media: 0, baixa: 0 }, insights: [],
  };
  if (!waConn) return empty;

  // Leads de anúncio reais (WhatsApp) no período
  const adLeads = await prisma.waLead.findMany({
    where: { connectionId: waConn.id, adId: { not: null }, enteredAt: { gte: start, lt: end } },
    select: { contactId: true, adId: true },
  });
  if (!adLeads.length && !metaConn) return empty;

  const contactIds = adLeads.map((l) => l.contactId);

  const [convs, msgGroups, insightRows, ads, campaigns] = await Promise.all([
    contactIds.length
      ? prisma.waConversation.findMany({
          where: { contactId: { in: contactIds } },
          select: { contactId: true, funnelStage: true, firstResponseSec: true, firstInboundAt: true, lastMessageAt: true },
        })
      : Promise.resolve([]),
    contactIds.length
      ? prisma.waMessage.groupBy({ by: ["contactId"], where: { contactId: { in: contactIds }, direction: "in" }, _count: { _all: true } })
      : Promise.resolve([] as { contactId: string; _count: { _all: number } }[]),
    metaConn
      ? prisma.metaAdInsight.groupBy({
          by: ["adId"],
          where: { connectionId: metaConn.id, date: { gte: start, lt: end } },
          _sum: { spend: true, impressions: true, clicks: true, leads: true },
        })
      : Promise.resolve([] as { adId: string; _sum: { spend: number | null; impressions: number | null; clicks: number | null; leads: number | null } }[]),
    metaConn ? prisma.metaAd.findMany({ where: { connectionId: metaConn.id }, select: { adId: true, name: true, campaignId: true, status: true } }) : Promise.resolve([]),
    metaConn ? prisma.metaCampaign.findMany({ where: { connectionId: metaConn.id }, select: { campaignId: true, name: true, status: true } }) : Promise.resolve([]),
  ]);

  const convByContact = new Map(convs.map((c) => [c.contactId, c]));
  const msgByContact = new Map(msgGroups.map((m) => [m.contactId, m._count._all]));
  const adMeta = new Map(ads.map((a) => [a.adId, a]));
  const campMeta = new Map(campaigns.map((c) => [c.campaignId, c]));

  const spendByAd = new Map<string, { spend: number; impressions: number; clicks: number; metaLeads: number }>();
  for (const r of insightRows) {
    spendByAd.set(r.adId, {
      spend: r._sum.spend ?? 0,
      impressions: r._sum.impressions ?? 0,
      clicks: r._sum.clicks ?? 0,
      metaLeads: r._sum.leads ?? 0,
    });
  }

  // ── Agregação por anúncio ──
  type Agg = { leads: number; atendidos: number; negociacoes: number; conversoes: number };
  const byAd = new Map<string, Agg>();
  const qualidade = { excelente: 0, boa: 0, media: 0, baixa: 0 };

  for (const l of adLeads) {
    const adId = l.adId!;
    const a = byAd.get(adId) ?? { leads: 0, atendidos: 0, negociacoes: 0, conversoes: 0 };
    a.leads++;
    const conv = convByContact.get(l.contactId);
    const stage = conv?.funnelStage ?? "recebido";
    if (conv?.firstResponseSec != null) a.atendidos++;
    if (stage === "negociacao" || stage === "convertido") a.negociacoes++;
    if (stage === "convertido") a.conversoes++;
    byAd.set(adId, a);

    // Score de qualidade do lead (0..100): etapa do funil + engajamento
    const msgs = msgByContact.get(l.contactId) ?? 0;
    let score = STAGE_POINTS[stage] ?? 10;
    score += msgs >= 8 ? 15 : msgs >= 4 ? 8 : msgs >= 2 ? 4 : 0;
    if (score > 100) score = 100;
    if (score >= 80) qualidade.excelente++;
    else if (score >= 55) qualidade.boa++;
    else if (score >= 30) qualidade.media++;
    else qualidade.baixa++;
  }

  // CPLs para calibrar "resultado" (mediana)
  const cplList: number[] = [];
  for (const [adId, agg] of byAd) {
    const spend = spendByAd.get(adId)?.spend ?? 0;
    if (agg.leads > 0 && spend > 0) cplList.push(spend / agg.leads);
  }
  const medianCpl = cplList.length
    ? [...cplList].sort((x, y) => x - y)[Math.floor(cplList.length / 2)]
    : null;

  const anuncios: AdRow[] = [...byAd.entries()].map(([adId, agg]) => {
    const m = adMeta.get(adId);
    const sp = spendByAd.get(adId);
    const investimento = sp?.spend ?? 0;
    const cpl = agg.leads > 0 && investimento > 0 ? investimento / agg.leads : null;
    const taxa = agg.leads > 0 ? agg.conversoes / agg.leads : 0;
    const campaignId = m?.campaignId ?? "—";
    return {
      adId,
      name: m?.name ?? "Anúncio não sincronizado",
      campaignId,
      campaignName: campMeta.get(campaignId)?.name ?? "—",
      status: m?.status ?? "UNKNOWN",
      investimento,
      leads: agg.leads,
      atendidos: agg.atendidos,
      negociacoes: agg.negociacoes,
      conversoes: agg.conversoes,
      cpl,
      taxaConversao: taxa,
      resultado: resultadoOf(agg.leads, agg.conversoes, taxa, cpl, medianCpl),
    };
  }).sort((a, b) => b.conversoes - a.conversoes || b.leads - a.leads);

  // ── Agregação por campanha ──
  const campAgg = new Map<string, Agg & { investimento: number }>();
  for (const ad of anuncios) {
    const e = campAgg.get(ad.campaignId) ?? { leads: 0, atendidos: 0, negociacoes: 0, conversoes: 0, investimento: 0 };
    e.leads += ad.leads; e.atendidos += ad.atendidos; e.negociacoes += ad.negociacoes;
    e.conversoes += ad.conversoes; e.investimento += ad.investimento;
    campAgg.set(ad.campaignId, e);
  }
  const campanhas: CampaignRow[] = [...campAgg.entries()].map(([campaignId, e]) => ({
    campaignId,
    name: campMeta.get(campaignId)?.name ?? "Campanha não sincronizada",
    status: campMeta.get(campaignId)?.status ?? "UNKNOWN",
    investimento: e.investimento,
    leads: e.leads,
    atendidos: e.atendidos,
    negociacoes: e.negociacoes,
    conversoes: e.conversoes,
    cpl: e.leads > 0 && e.investimento > 0 ? e.investimento / e.leads : null,
    taxaConversao: e.leads > 0 ? e.conversoes / e.leads : 0,
  })).sort((a, b) => b.conversoes - a.conversoes || b.leads - a.leads);

  // ── Totais / funil ──
  let impressoes = 0, cliques = 0, investimentoTotal = 0;
  for (const v of spendByAd.values()) { impressoes += v.impressions; cliques += v.clicks; investimentoTotal += v.spend; }
  const totalLeads = adLeads.length;
  const totalAtendidos = anuncios.reduce((s, a) => s + a.atendidos, 0);
  const totalNeg = anuncios.reduce((s, a) => s + a.negociacoes, 0);
  const totalConv = anuncios.reduce((s, a) => s + a.conversoes, 0);
  const cplReal = totalLeads > 0 && investimentoTotal > 0 ? investimentoTotal / totalLeads : null;
  const taxaConversao = totalLeads > 0 ? totalConv / totalLeads : 0;

  const insights = buildInsights({
    campanhas, anuncios, totalLeads, totalAtendidos, totalNeg, totalConv, taxaConversao,
  });

  return {
    hasMeta: !!metaConn,
    hasAdData: anuncios.length > 0 || totalLeads > 0,
    cards: { oportunidades: totalLeads, investimento: investimentoTotal, cplReal, conversoes: totalConv, taxaConversao },
    funil: { impressoes, cliques, leads: totalLeads, atendidos: totalAtendidos, negociacoes: totalNeg, conversoes: totalConv },
    campanhas,
    anuncios,
    qualidade,
    insights,
  };
}

// Frases automáticas — leitura comercial, não técnica.
function buildInsights(d: {
  campanhas: CampaignRow[]; anuncios: AdRow[];
  totalLeads: number; totalAtendidos: number; totalNeg: number; totalConv: number; taxaConversao: number;
}): string[] {
  const out: string[] = [];
  const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

  // 1) Campanha que mais gera leads
  if (d.campanhas.length && d.totalLeads > 0) {
    const top = [...d.campanhas].sort((a, b) => b.leads - a.leads)[0];
    if (top.leads > 0) out.push(`A campanha "${top.name}" gerou ${fmtPct(top.leads / d.totalLeads)} das oportunidades do período.`);
  }
  // 2) Menor CPL
  const comCpl = d.anuncios.filter((a) => a.cpl != null && a.leads > 0);
  if (comCpl.length) {
    const best = comCpl.sort((a, b) => (a.cpl! - b.cpl!))[0];
    out.push(`O anúncio "${best.name}" tem o menor custo por oportunidade da conta (R$ ${best.cpl!.toFixed(2)}).`);
  }
  // 3) Muitos leads, baixa conversão
  const lowConv = d.campanhas.find((c) => c.leads >= 5 && c.taxaConversao < 0.05);
  if (lowConv) out.push(`A campanha "${lowConv.name}" gera bastante oportunidade, mas converte pouco (${fmtPct(lowConv.taxaConversao)}).`);
  // 4) Gargalo: atendimento vs geração
  if (d.totalLeads >= 5) {
    const taxaAtend = d.totalAtendidos / d.totalLeads;
    if (taxaAtend < 0.6) out.push(`O gargalo atual está no atendimento, não na geração de leads: só ${fmtPct(taxaAtend)} das oportunidades foram atendidas.`);
    else if (d.totalNeg > 0 && d.totalConv === 0) out.push("As oportunidades chegam e são atendidas, mas ainda não fecham — o gargalo está na conversão.");
    else if (d.taxaConversao >= 0.15) out.push(`Operação saudável: ${fmtPct(d.taxaConversao)} das oportunidades viraram conversão.`);
  }
  // 5) Desperdício
  const desperdicio = d.anuncios.filter((a) => a.resultado === "desperdicio");
  if (desperdicio.length) out.push(`${desperdicio.length} anúncio(s) consomem investimento sem gerar conversão — candidatos a revisão.`);

  return out;
}
