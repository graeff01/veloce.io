import { prisma } from "@/lib/prisma";
import { esc } from "@/lib/notifications/digest";
import { waMe, excludedTokens, nameExcluded } from "@/lib/notifications/client-bot";
import { getOrCreatePortal } from "@/lib/notifications/client-portal";
import { nowParts, wallToInstant } from "@/lib/tz";

// Read-model client-safe: respostas sob demanda do bot do cliente. Só lê dado que
// o cliente pode ver (leads/atendimento daquele clientId) — embrião da camada
// client-facing que o dashboard vai reusar.

const TZ = "America/Sao_Paulo";

async function connIdsFor(clientId: string): Promise<string[]> {
  const conns = await prisma.waConnection.findMany({ where: { clientId }, select: { id: true } });
  return conns.map((c) => c.id);
}

type Temp = "hot" | "warm" | "cold";
function tempOf(funnelStage: string | null, score: number | null, temperature: string | null): Temp {
  if (funnelStage === "negociacao" || (score ?? 0) >= 70 || temperature === "hot") return "hot";
  if (funnelStage === "qualificado" || (score ?? 0) >= 40 || temperature === "warm") return "warm";
  return "cold";
}

// Leads aguardando agora, com temperatura de cada um (funil grátis + score IA).
// Filtra nomes excluídos (ex.: família do dono).
export async function waitingWithTemp(connIds: string[], excluded: string[] = []) {
  const waiting = await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, status: "waiting", funnelStage: { notIn: ["convertido", "perdido"] } },
    select: { contactId: true, funnelStage: true, lastInboundAt: true, contact: { select: { name: true, waId: true } } },
    orderBy: { lastInboundAt: "asc" },
  });
  if (waiting.length === 0) return [];
  const profiles = await prisma.leadProfile.findMany({
    where: { contactId: { in: waiting.map((w) => w.contactId) } },
    select: { contactId: true, score: true, temperature: true },
  });
  const pmap = new Map(profiles.map((p) => [p.contactId, p]));
  return waiting
    .filter((w) => !nameExcluded(w.contact.name, excluded))
    .map((w) => {
      const p = pmap.get(w.contactId);
      return { name: (w.contact.name || "").trim() || "Lead", waId: w.contact.waId, lastInboundAt: w.lastInboundAt, temp: tempOf(w.funnelStage, p?.score ?? null, p?.temperature ?? null) };
    });
}

function hoursAgo(d: Date | null): string {
  if (!d) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `há ${min}min`;
  return `há ${Math.floor(min / 60)}h`;
}

// /status — quantos aguardando agora + termômetro.
export async function statusNow(clientId: string): Promise<string> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return "Sem WhatsApp conectado ainda.";
  const w = await waitingWithTemp(connIds, await excludedTokens(clientId));
  if (w.length === 0) return "🔔 <b>Status agora</b>\nNenhum lead aguardando resposta. 👌";
  const hot = w.filter((x) => x.temp === "hot").length;
  const warm = w.filter((x) => x.temp === "warm").length;
  const cold = w.filter((x) => x.temp === "cold").length;
  return `🔔 <b>Status agora</b>\n${w.length} lead${w.length > 1 ? "s" : ""} aguardando resposta\n🌡️ 🔥 ${hot} · 🟠 ${warm} · 🧊 ${cold}`;
}

// /quentes — leads quentes aguardando (cada um abre o WhatsApp direto).
export async function quentesAguardando(clientId: string): Promise<string> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return "Sem WhatsApp conectado ainda.";
  const hot = (await waitingWithTemp(connIds, await excludedTokens(clientId))).filter((x) => x.temp === "hot");
  if (hot.length === 0) return "🔥 <b>Leads quentes</b>\nNenhum lead quente aguardando agora.";
  const lines = hot.slice(0, 10).map((x) => {
    const wa = waMe(x.waId);
    const nome = wa ? `<a href="${wa}">${esc(x.name)}</a>` : `<b>${esc(x.name)}</b>`;
    return `• ${nome} ${hoursAgo(x.lastInboundAt)}`;
  });
  return `🔥 <b>Leads quentes aguardando</b> (${hot.length})\n${lines.join("\n")}\n<i>toque no nome para responder</i>`;
}

// /resultados — placar de hoje.
export async function resultadosHoje(clientId: string): Promise<string> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return "Sem WhatsApp conectado ainda.";
  const start = wallToInstant(nowParts(TZ).ymd, "00:00", TZ);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const convs = await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, firstInboundAt: { gte: start, lt: end } },
    select: { firstResponseSec: true, funnelStage: true },
  });
  const leads = convs.length;
  if (leads === 0) return "📊 <b>Hoje</b>\nNenhum lead novo ainda hoje.";
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.map((c) => c.firstResponseSec).filter((s): s is number => s != null);
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxa = Math.round((respondidos / leads) * 100);
  return (
    `📊 <b>Hoje</b>\n` +
    `• 💬 ${leads} lead${leads > 1 ? "s" : ""}\n` +
    `• ✅ ${respondidos} respondido${respondidos !== 1 ? "s" : ""} <i>(${taxa}%)</i>\n` +
    `• 🎯 ${conversoes} conversã${conversoes !== 1 ? "ões" : "o"}` +
    (avgMin != null ? `\n• ⏱️ Tempo médio: ${avgMin} min` : "")
  );
}

// ── Read-model do DASHBOARD (client-safe) ────────────────────────────────────
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export type Period = "week" | "month";

export interface ClientDashboard {
  generatedAt: string;
  period: Period;
  periodLabel: string;
  narrative: string[];
  health: { score: number; label: string };
  score: { marketing: number; atendimento: number; conversao: number; total: number };
  deltas: { leads: number | null; spend: number | null; cpl: number | null; conversao: number | null; tempoResposta: number | null };
  responseBuckets: { upTo5: number; upTo30: number; upTo60: number; over60: number; sem: number };
  atendimento: { leads: number; leadsPrev: number; deltaPct: number | null; respondidos: number; taxaResposta: number; tempoMedioMin: number | null; conversoes: number };
  termometro: { hot: number; warm: number; cold: number; total: number };
  midia: { spend: number; leads: number; cpl: number | null } | null;
  bestCampaign: { name: string; leads: number; image: string | null; creativeId: string | null } | null;
  series: { day: string; leads: number }[];
}

// Início do período (BRT) + período comparável anterior, para "semana" ou "mês".
export function periodRanges(period: Period): { start: Date; now: Date; prevStart: Date; prevEnd: Date; label: string } {
  const now = new Date();
  if (period === "week") {
    const start = new Date(now.getTime() - 7 * 86_400_000);
    return { start, now, prevStart: new Date(now.getTime() - 14 * 86_400_000), prevEnd: start, label: "Últimos 7 dias" };
  }
  const [y, m] = nowParts(TZ).ymd.split("-").map(Number);
  const mm = (yy: number, mo: number) => wallToInstant(`${yy}-${String(mo).padStart(2, "0")}-01`, "00:00", TZ);
  const start = mm(y, m);
  const prevStart = mm(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
  return { start, now, prevStart, prevEnd: new Date(prevStart.getTime() + (now.getTime() - start.getTime())), label: `${MONTHS[m - 1]} ${y}` };
}

// Health Score 0–100 (velocidade 35 + resposta 30 + conversão 20 + quentes atendidos 15).
function healthScore(a: ClientDashboard["atendimento"], hot: number): { score: number; label: string } {
  const vVel = a.tempoMedioMin == null ? 50 : Math.max(0, Math.min(100, 100 - (a.tempoMedioMin - 5) * (100 / 55)));
  const vResp = a.taxaResposta;
  const vConv = a.leads > 0 ? Math.min(100, (a.conversoes / a.leads) * 100 * 5) : 50;
  const vHot = hot === 0 ? 100 : Math.max(0, 100 - hot * 15);
  const score = Math.round(vVel * 0.35 + vResp * 0.30 + vConv * 0.20 + vHot * 0.15);
  const label = score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Atenção" : "Crítico";
  return { score, label };
}

// Health Score com breakdown (metodologia Veloce): Marketing 40% · Atendimento 35% ·
// Conversão 25%. Determinístico e auditável.
function vclamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }
function healthBreakdown(a: ClientDashboard["atendimento"], series: { day: string; leads: number }[]): ClientDashboard["score"] {
  const semResposta = Math.max(0, a.leads - a.respondidos);
  const semRatio = a.leads > 0 ? semResposta / a.leads : 0;
  const timePenalty = a.tempoMedioMin == null ? 12 : Math.min(45, (a.tempoMedioMin / 60) * 6);
  const atendimento = a.leads > 0 ? vclamp(100 - semRatio * 70 - timePenalty) : 55;
  const conversao = a.leads > 0 ? vclamp((a.conversoes / a.leads) * 100 * 5) : 55;
  // Marketing: volume + crescimento + estabilidade da captação (variância da série).
  const vals = series.map((s) => s.leads);
  const mean = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
  const variance = vals.length ? vals.reduce((x, y) => x + (y - mean) ** 2, 0) / vals.length : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const stability = mean > 0 ? vclamp((1 - Math.min(1, cv)) * 12) : 0;
  const growth = a.deltaPct != null ? Math.max(-30, Math.min(30, a.deltaPct)) * 0.6 : 0;
  const marketing = vclamp(60 + (a.leads > 0 ? 8 : -25) + growth + stability);
  const total = vclamp(marketing * 0.40 + atendimento * 0.35 + conversao * 0.25);
  return { marketing, atendimento, conversao, total };
}

function narrative(a: ClientDashboard["atendimento"], hot: number, periodWord: string): string[] {
  const out: string[] = [];
  if (a.leads === 0) { out.push(`Nenhum lead novo ${periodWord} até agora.`); return out; }
  if (a.deltaPct != null) {
    const v = a.deltaPct;
    out.push(v >= 10 ? `📈 Volume de leads ${v}% acima do período anterior — momento de aproveitar.`
      : v <= -10 ? `📉 Volume de leads ${Math.abs(v)}% abaixo do período anterior — vale revisar a mídia.`
      : `Volume de leads estável vs. o período anterior.`);
  }
  if (a.tempoMedioMin != null) {
    out.push(a.tempoMedioMin <= 10 ? `⚡ Atendimento rápido: ${a.tempoMedioMin}min de média e ${a.taxaResposta}% respondidos.`
      : `⏱️ Tempo médio de resposta em ${a.tempoMedioMin}min — abaixo de 10min converte bem mais.`);
  }
  if (hot > 0) out.push(`🔥 ${hot} lead${hot > 1 ? "s" : ""} quente${hot > 1 ? "s" : ""} aguardando agora — priorize hoje.`);
  return out.slice(0, 3);
}

export async function getClientDashboard(clientId: string, period: Period = "month"): Promise<ClientDashboard> {
  const { start, now, prevStart, prevEnd, label } = periodRanges(period);
  const connIds = await connIdsFor(clientId);
  const excluded = await excludedTokens(clientId);

  const [convsRaw, prevConvsRaw, waiting, metaConn, wa] = await Promise.all([
    connIds.length ? prisma.waConversation.findMany({ where: { connectionId: { in: connIds }, firstInboundAt: { gte: start, lt: now } }, select: { firstResponseSec: true, funnelStage: true, firstInboundAt: true, contact: { select: { name: true } } } }) : Promise.resolve([]),
    connIds.length ? prisma.waConversation.findMany({ where: { connectionId: { in: connIds }, firstInboundAt: { gte: prevStart, lt: prevEnd } }, select: { firstResponseSec: true, funnelStage: true, contact: { select: { name: true } } } }) : Promise.resolve([]),
    waitingWithTemp(connIds, excluded),
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }),
    prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } }),
  ]);
  const convs = convsRaw.filter((c) => !nameExcluded(c.contact.name, excluded));
  const prevConvs = prevConvsRaw.filter((c) => !nameExcluded(c.contact.name, excluded));
  const prevLeads = prevConvs.length;
  const prevConversoes = prevConvs.filter((c) => c.funnelStage === "convertido").length;
  const prevTimes = prevConvs.map((c) => c.firstResponseSec).filter((s): s is number => s != null);
  const prevTempoMedio = prevTimes.length ? Math.round(prevTimes.reduce((a, b) => a + b, 0) / prevTimes.length / 60) : null;

  const leads = convs.length;
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.map((c) => c.firstResponseSec).filter((s): s is number => s != null);
  const tempoMedioMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxaResposta = leads > 0 ? Math.round((respondidos / leads) * 100) : 0;
  const deltaPct = prevLeads > 0 ? Math.round(((leads - prevLeads) / prevLeads) * 100) : null;

  // Distribuição do tempo de 1ª resposta (qualidade operacional do atendimento).
  const responseBuckets = { upTo5: 0, upTo30: 0, upTo60: 0, over60: 0, sem: 0 };
  for (const c of convs) {
    const sec = c.firstResponseSec;
    if (sec == null) responseBuckets.sem++;
    else if (sec <= 300) responseBuckets.upTo5++;
    else if (sec <= 1800) responseBuckets.upTo30++;
    else if (sec <= 3600) responseBuckets.upTo60++;
    else responseBuckets.over60++;
  }
  const atendimento = { leads, leadsPrev: prevLeads, deltaPct, respondidos, taxaResposta, tempoMedioMin, conversoes };

  // Série diária de conversas (mini-gráfico de tendência no painel).
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD em BRT
  const dayCounts = new Map<string, number>();
  for (const c of convs) { if (c.firstInboundAt) { const k = dayKey(c.firstInboundAt); dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1); } }
  const series: { day: string; leads: number }[] = [];
  for (let t = start.getTime(); t <= now.getTime(); t += 86_400_000) { const k = dayKey(new Date(t)); series.push({ day: k, leads: dayCounts.get(k) ?? 0 }); }

  const hot = waiting.filter((w) => w.temp === "hot").length;
  const warm = waiting.filter((w) => w.temp === "warm").length;
  const cold = waiting.filter((w) => w.temp === "cold").length;

  // Mídia + melhor campanha (leads reais de anúncio agrupados por campanha).
  let midia: ClientDashboard["midia"] = null;
  let bestCampaign: ClientDashboard["bestCampaign"] = null;
  let spendCur = 0, spendPrev = 0, cplCur: number | null = null, cplPrev: number | null = null;
  if (metaConn) {
    const [spendAgg, adLeads, leadRows, prevSpendAgg, prevAdLeads] = await Promise.all([
      prisma.metaAdInsight.aggregate({ _sum: { spend: true }, where: { connectionId: metaConn.id, date: { gte: start } } }),
      wa ? prisma.waLead.count({ where: { connectionId: wa.id, enteredAt: { gte: start, lt: now } } }) : Promise.resolve(0),
      wa ? prisma.waLead.groupBy({ by: ["adId"], where: { connectionId: wa.id, enteredAt: { gte: start, lt: now }, adId: { not: null } }, _count: { _all: true } }) : Promise.resolve([] as { adId: string | null; _count: { _all: number } }[]),
      prisma.metaAdInsight.aggregate({ _sum: { spend: true }, where: { connectionId: metaConn.id, date: { gte: prevStart, lt: prevEnd } } }),
      wa ? prisma.waLead.count({ where: { connectionId: wa.id, enteredAt: { gte: prevStart, lt: prevEnd } } }) : Promise.resolve(0),
    ]);
    const spend = spendAgg._sum.spend ?? 0;
    midia = { spend, leads: adLeads, cpl: adLeads > 0 ? spend / adLeads : null };
    spendCur = spend; cplCur = midia.cpl;
    spendPrev = prevSpendAgg._sum.spend ?? 0;
    cplPrev = prevAdLeads > 0 ? spendPrev / prevAdLeads : null;

    const adIds = leadRows.map((r) => r.adId).filter((x): x is string => !!x);
    if (adIds.length) {
      const ads = await prisma.metaAd.findMany({ where: { connectionId: metaConn.id, adId: { in: adIds } }, select: { adId: true, campaignId: true, creativeId: true } });
      const adToCamp = new Map(ads.map((a) => [a.adId, a.campaignId]));
      const adToCreative = new Map(ads.map((a) => [a.adId, a.creativeId]));
      const byCamp = new Map<string, number>();
      for (const r of leadRows) { const camp = r.adId ? adToCamp.get(r.adId) : null; if (camp) byCamp.set(camp, (byCamp.get(camp) ?? 0) + r._count._all); }
      let topCamp: string | null = null, topN = 0;
      for (const [camp, n] of byCamp) if (n > topN) { topN = n; topCamp = camp; }
      if (topCamp) {
        const c = await prisma.metaCampaign.findFirst({ where: { connectionId: metaConn.id, campaignId: topCamp }, select: { name: true } });
        // imagem do melhor anúncio (mais leads) da campanha vencedora — pro mockup do feed.
        let bestAd: string | null = null, bestAdN = 0;
        for (const r of leadRows) { if (r.adId && adToCamp.get(r.adId) === topCamp && r._count._all > bestAdN) { bestAdN = r._count._all; bestAd = r.adId; } }
        const creativeId = bestAd ? adToCreative.get(bestAd) : null;
        let image: string | null = null;
        if (creativeId) {
          const cr = await prisma.metaCreative.findUnique({ where: { connectionId_creativeId: { connectionId: metaConn.id, creativeId } }, select: { thumbnailUrl: true } });
          image = cr?.thumbnailUrl ?? null;
        }
        bestCampaign = { name: c?.name ?? "Campanha", leads: topN, image, creativeId: creativeId ?? null };
      }
    }
  }

  // Deltas vs. período anterior (contexto temporal nos KPIs).
  const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
  const convRateCur = leads > 0 ? conversoes / leads : 0;
  const convRatePrev = prevLeads > 0 ? prevConversoes / prevLeads : 0;
  const deltas: ClientDashboard["deltas"] = {
    leads: deltaPct,
    spend: pct(spendCur, spendPrev),
    cpl: cplCur != null && cplPrev != null ? pct(cplCur, cplPrev) : null,
    conversao: convRatePrev > 0 ? Math.round(((convRateCur - convRatePrev) / convRatePrev) * 100) : null,
    tempoResposta: tempoMedioMin != null && prevTempoMedio != null ? pct(tempoMedioMin, prevTempoMedio) : null,
  };

  return {
    generatedAt: now.toISOString(),
    period, periodLabel: label,
    narrative: narrative(atendimento, hot, period === "week" ? "nos últimos 7 dias" : "no mês"),
    health: healthScore(atendimento, hot),
    score: healthBreakdown(atendimento, series),
    deltas,
    responseBuckets,
    atendimento,
    termometro: { hot, warm, cold, total: waiting.length },
    midia, bestCampaign, series,
  };
}

// Benchmark anônimo: percentil da TAXA DE RESPOSTA deste cliente vs. as demais contas.
// Retorna "% das contas que este cliente supera" (null se não há base suficiente).
export async function getBenchmark(clientId: string, period: Period = "month"): Promise<number | null> {
  const { start, now } = periodRanges(period);
  const [totals, responded, conns] = await Promise.all([
    prisma.waConversation.groupBy({ by: ["connectionId"], where: { firstInboundAt: { gte: start, lt: now } }, _count: { _all: true } }),
    prisma.waConversation.groupBy({ by: ["connectionId"], where: { firstInboundAt: { gte: start, lt: now }, firstResponseSec: { not: null } }, _count: { _all: true } }),
    prisma.waConnection.findMany({ select: { id: true, clientId: true } }),
  ]);
  const toClient = new Map(conns.map((c) => [c.id, c.clientId]));
  const tot = new Map<string, number>(), resp = new Map<string, number>();
  for (const r of totals) { const cl = toClient.get(r.connectionId); if (cl) tot.set(cl, (tot.get(cl) ?? 0) + r._count._all); }
  for (const r of responded) { const cl = toClient.get(r.connectionId); if (cl) resp.set(cl, (resp.get(cl) ?? 0) + r._count._all); }

  const rates: { clientId: string; rate: number }[] = [];
  for (const [cl, t] of tot) if (t >= 3) rates.push({ clientId: cl, rate: (resp.get(cl) ?? 0) / t }); // volume mínimo p/ ser justo
  if (rates.length < 3) return null;
  const mine = rates.find((r) => r.clientId === clientId);
  if (!mine) return null;
  const beats = rates.filter((r) => r.rate < mine.rate).length;
  return Math.round((beats / (rates.length - 1)) * 100);
}

// /semana e /mes — placar do período (reusa o read-model do dashboard).
export async function resumoPeriodo(clientId: string, period: Period): Promise<string> {
  const d = await getClientDashboard(clientId, period);
  const a = d.atendimento;
  const titulo = period === "week" ? "Últimos 7 dias" : "Este mês";
  if (a.leads === 0) return `📊 <b>${titulo}</b>\nNenhum lead no período.`;
  const portal = await getOrCreatePortal(clientId);
  return (
    `📊 <b>${titulo}</b>\n` +
    `• 💬 ${a.leads} leads${a.deltaPct != null ? ` <i>(${a.deltaPct >= 0 ? "+" : ""}${a.deltaPct}%)</i>` : ""}\n` +
    `• ✅ ${a.respondidos} respondidos <i>(${a.taxaResposta}%)</i>\n` +
    `• 🎯 ${a.conversoes} conversões` +
    (a.tempoMedioMin != null ? `\n• ⏱️ Tempo médio: ${a.tempoMedioMin} min` : "") +
    `\n\n<a href="${portal.link}">📊 Painel completo</a>`
  );
}

export function ajuda(brandName: string | null): string {
  const marca = brandName?.trim() ? ` da <b>${esc(brandName.trim())}</b>` : "";
  return (
    `🤖 <b>Assistente${marca}</b>\nComandos disponíveis:\n` +
    `• /status — leads aguardando agora\n` +
    `• /quentes — leads quentes na fila\n` +
    `• /resultados — placar de hoje\n` +
    `• /semana — placar dos últimos 7 dias\n` +
    `• /painel — abrir o painel completo\n` +
    `• /silenciar — pausar alertas por 2h\n` +
    `• /ajuda — ver esta lista`
  );
}
