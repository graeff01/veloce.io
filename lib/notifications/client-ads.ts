import { prisma } from "@/lib/prisma";
import { periodRanges, type Period } from "@/lib/notifications/client-report";

// ── Transparência de anúncios (portal do cliente) ─────────────────────────────
// Visão CURADA pro dono da loja: pra onde foi o investimento, o que está
// funcionando e a evolução — sem segmentação/lances/acesso à conta (isso é
// operação interna da agência). Reaproveita a atribuição de leads→anúncio já
// usada no dashboard (waLead.adId → metaAd.campaignId) e o gasto de metaAdInsight.

const TZ = "America/Sao_Paulo";

export interface ClientAds {
  hasMeta: boolean;
  periodLabel: string;
  currency: string;
  spend: number;
  leads: number;
  cpl: number | null;
  deltas: { spend: number | null; leads: number | null; cpl: number | null };
  topCampaigns: { name: string; spend: number; leads: number; cpl: number | null; pctSpend: number }[];
  bestCreative: { campaignName: string; leads: number; image: string | null; creativeId: string | null; videoId: string | null } | null;
  series: { day: string; spend: number; leads: number }[];
}

const pctDelta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

export async function getClientAds(clientId: string, period: Period = "month"): Promise<ClientAds> {
  const { start, end, prevStart, prevEnd, label } = periodRanges(period);
  const [metaConn, wa] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true, currency: true } }),
    prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } }),
  ]);

  const empty: ClientAds = {
    hasMeta: !!metaConn, periodLabel: label, currency: metaConn?.currency || "BRL",
    spend: 0, leads: 0, cpl: null, deltas: { spend: null, leads: null, cpl: null },
    topCampaigns: [], bestCreative: null, series: [],
  };
  if (!metaConn) return empty;

  // metaAdInsight.date é o date_start do dia gravado à MEIA-NOITE UTC — um marcador
  // de dia-calendário, não um instante. Filtrar por meia-noite de São Paulo (03:00Z)
  // deixa o gasto do 1º dia do período (00:00Z) DE FORA (cai no período anterior),
  // divergindo da aba Anúncios interna (fonte correta, que filtra em UTC no servidor
  // Railway). Convertemos os limites para dia-calendário em UTC para bater com ela.
  const utcDayStart = (d: Date) => new Date(`${d.toLocaleDateString("en-CA", { timeZone: TZ })}T00:00:00.000Z`);
  const utcDayEndExcl = (d: Date) => new Date(utcDayStart(new Date(d.getTime() - 1)).getTime() + 86_400_000);
  const insStart = utcDayStart(start), insEnd = utcDayEndExcl(end);
  const prevInsStart = utcDayStart(prevStart), prevInsEnd = utcDayEndExcl(prevEnd);

  const [insightRows, prevSpendAgg, leadRows, prevAdLeads] = await Promise.all([
    prisma.metaAdInsight.findMany({ where: { connectionId: metaConn.id, date: { gte: insStart, lt: insEnd } }, select: { adId: true, date: true, spend: true } }),
    prisma.metaAdInsight.aggregate({ _sum: { spend: true }, where: { connectionId: metaConn.id, date: { gte: prevInsStart, lt: prevInsEnd } } }),
    wa ? prisma.waLead.groupBy({ by: ["adId"], where: { connectionId: wa.id, enteredAt: { gte: start, lt: end }, adId: { not: null } }, _count: { _all: true } }) : Promise.resolve([] as { adId: string | null; _count: { _all: number } }[]),
    wa ? prisma.waLead.count({ where: { connectionId: wa.id, enteredAt: { gte: prevStart, lt: prevEnd } } }) : Promise.resolve(0),
  ]);

  const spend = insightRows.reduce((s, r) => s + r.spend, 0);
  const leads = leadRows.reduce((s, r) => s + r._count._all, 0);
  const spendPrev = prevSpendAgg._sum.spend ?? 0;
  const cpl = leads > 0 ? spend / leads : null;
  const cplPrev = prevAdLeads > 0 ? spendPrev / prevAdLeads : null;

  // adId → campaignId/creativeId (dos anúncios com gasto OU lead no período).
  const adIds = [...new Set([...insightRows.map((r) => r.adId), ...leadRows.map((r) => r.adId).filter((x): x is string => !!x)])];
  const ads = adIds.length ? await prisma.metaAd.findMany({ where: { connectionId: metaConn.id, adId: { in: adIds } }, select: { adId: true, campaignId: true, creativeId: true } }) : [];
  const adToCamp = new Map(ads.map((a) => [a.adId, a.campaignId]));
  const adToCreative = new Map(ads.map((a) => [a.adId, a.creativeId]));

  // Gasto e leads por campanha.
  const campSpend = new Map<string, number>();
  const campLeads = new Map<string, number>();
  for (const r of insightRows) { const camp = adToCamp.get(r.adId); if (camp) campSpend.set(camp, (campSpend.get(camp) ?? 0) + r.spend); }
  for (const r of leadRows) { const camp = r.adId ? adToCamp.get(r.adId) : null; if (camp) campLeads.set(camp, (campLeads.get(camp) ?? 0) + r._count._all); }

  const campIds = [...new Set([...campSpend.keys(), ...campLeads.keys()])];
  const campNames = campIds.length
    ? new Map((await prisma.metaCampaign.findMany({ where: { connectionId: metaConn.id, campaignId: { in: campIds } }, select: { campaignId: true, name: true } })).map((c) => [c.campaignId, c.name]))
    : new Map<string, string>();

  const topCampaigns = campIds.map((id) => {
    const s = campSpend.get(id) ?? 0;
    const l = campLeads.get(id) ?? 0;
    return { name: campNames.get(id) ?? "Campanha", spend: Math.round(s * 100) / 100, leads: l, cpl: l > 0 ? Math.round((s / l) * 100) / 100 : null, pctSpend: spend > 0 ? Math.round((s / spend) * 100) : 0 };
  }).sort((a, b) => b.spend - a.spend).slice(0, 5);

  // Melhor criativo: anúncio com mais leads no período → thumbnail.
  let bestCreative: ClientAds["bestCreative"] = null;
  let bestAd: string | null = null, bestAdN = 0;
  for (const r of leadRows) { if (r.adId && r._count._all > bestAdN) { bestAdN = r._count._all; bestAd = r.adId; } }
  if (bestAd) {
    const campId = adToCamp.get(bestAd);
    const creativeId = adToCreative.get(bestAd) ?? null;
    let image: string | null = null;
    let videoId: string | null = null;
    if (creativeId) {
      const cr = await prisma.metaCreative.findUnique({ where: { connectionId_creativeId: { connectionId: metaConn.id, creativeId } }, select: { thumbnailUrl: true, imageUrl: true, videoId: true } });
      image = cr?.imageUrl || cr?.thumbnailUrl || null; // prioriza alta resolução
      videoId = cr?.videoId ?? null;
    }
    bestCreative = { campaignName: (campId && campNames.get(campId)) || "Campanha", leads: bestAdN, image, creativeId, videoId };
  }

  // Série diária: investimento x leads (evolução).
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const spendByDay = new Map<string, number>();
  // Insight já é um marcador de dia-calendário (00:00Z) — a data ISO em UTC É o
  // date_start. Usar dayKey (SP) sobre 00:00Z deslocaria o gasto pro dia anterior.
  for (const r of insightRows) { const k = r.date.toISOString().slice(0, 10); spendByDay.set(k, (spendByDay.get(k) ?? 0) + r.spend); }
  const leadsByDay = new Map<string, number>();
  if (wa) {
    const leadDays = await prisma.waLead.findMany({ where: { connectionId: wa.id, enteredAt: { gte: start, lt: end } }, select: { enteredAt: true } });
    for (const l of leadDays) { const k = dayKey(l.enteredAt); leadsByDay.set(k, (leadsByDay.get(k) ?? 0) + 1); }
  }
  const series: ClientAds["series"] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) { const k = dayKey(new Date(t)); series.push({ day: k, spend: Math.round((spendByDay.get(k) ?? 0) * 100) / 100, leads: leadsByDay.get(k) ?? 0 }); }

  return {
    hasMeta: true, periodLabel: label, currency: metaConn.currency || "BRL",
    spend: Math.round(spend * 100) / 100, leads, cpl: cpl != null ? Math.round(cpl * 100) / 100 : null,
    deltas: { spend: pctDelta(spend, spendPrev), leads: null, cpl: cpl != null && cplPrev != null ? pctDelta(cpl, cplPrev) : null },
    topCampaigns, bestCreative, series,
  };
}
