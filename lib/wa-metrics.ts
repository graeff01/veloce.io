import { prisma } from "@/lib/prisma";

// Janela de "encerramento por inatividade" e limiares de alerta (interno; nunca
// afeta o WhatsApp da loja). Centralizado para fácil ajuste futuro.
export const WA_THRESHOLDS = {
  closeAfterHours: 24,   // conversa vira "closed" (rótulo interno)
  waitingAlertHours: 2,  // aguardando resposta há mais de X h
  abandonedHours: 24,    // sem retorno há mais de X h
};

const FUNNEL_STAGES = ["recebido", "respondido", "qualificado", "negociacao", "perdido", "convertido"] as const;

// ── Visão geral da operação (dashboard) ──────────────────────────────────────
// Base: WaConversation (toda pessoa que chamou = 1 lead). WaLead marca a origem
// de anúncio. Tudo em poucas queries indexadas → escala para milhares de conversas.
export interface Overview {
  leads: number;
  responded: number;
  unanswered: number;
  responseRate: number;
  avgFirstResponseSec: number | null;
  medianFirstResponseSec: number | null;
  buckets: { upTo5min: number; upTo30min: number; upTo1h: number; over1h: number; unanswered: number };
  byOrigin: { ad: number; organic: number };
  byAd: { adTitle: string; total: number }[];
  series: { date: string; leads: number }[];
  funnel: Record<(typeof FUNNEL_STAGES)[number], number>;
  waitingNow: number;
  alerts: {
    waiting: number;     // aguardando há > waitingAlertHours
    abandoned: number;   // sem retorno há > abandonedHours
    sample: { contactId: string; name: string | null; waId: string; waitingSince: string | null }[];
  };
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function computeOverview(connectionId: string, start: Date, end: Date): Promise<Overview> {
  const now = Date.now();
  const waitingCut = new Date(now - WA_THRESHOLDS.waitingAlertHours * 3_600_000);
  const abandonedCut = new Date(now - WA_THRESHOLDS.abandonedHours * 3_600_000);

  const [convs, adLeads, waitingNow, alertRows] = await Promise.all([
    prisma.waConversation.findMany({
      where: { connectionId, firstInboundAt: { gte: start, lt: end } },
      select: { contactId: true, firstInboundAt: true, firstResponseSec: true, funnelStage: true },
    }),
    prisma.waLead.findMany({
      where: { connectionId, enteredAt: { gte: start, lt: end } },
      select: { contactId: true, adTitle: true, adModel: true },
    }),
    prisma.waConversation.count({ where: { connectionId, status: "waiting" } }),
    prisma.waConversation.findMany({
      where: { connectionId, status: "waiting", lastMessageAt: { lt: waitingCut } },
      orderBy: { lastMessageAt: "asc" },
      take: 50,
      select: { contactId: true, lastMessageAt: true, contact: { select: { name: true, waId: true } } },
    }),
  ]);

  const buckets = { upTo5min: 0, upTo30min: 0, upTo1h: 0, over1h: 0, unanswered: 0 };
  const funnel = { recebido: 0, respondido: 0, qualificado: 0, negociacao: 0, perdido: 0, convertido: 0 };
  const seriesMap = new Map<string, number>();
  const times: number[] = [];
  let responded = 0;

  for (const c of convs) {
    funnel.recebido++;
    const sec = c.firstResponseSec;
    if (sec != null) {
      responded++;
      times.push(sec);
      funnel.respondido++;
      if (sec <= 300) buckets.upTo5min++;
      else if (sec <= 1800) buckets.upTo30min++;
      else if (sec <= 3600) buckets.upTo1h++;
      else buckets.over1h++;
    } else {
      buckets.unanswered++;
    }
    if (c.funnelStage && c.funnelStage in funnel && c.funnelStage !== "recebido" && c.funnelStage !== "respondido") {
      funnel[c.funnelStage as keyof typeof funnel]++;
    }
    if (c.firstInboundAt) seriesMap.set(dayKey(c.firstInboundAt), (seriesMap.get(dayKey(c.firstInboundAt)) ?? 0) + 1);
  }

  const adContactIds = new Set(adLeads.map((l) => l.contactId));
  const adCount = convs.filter((c) => adContactIds.has(c.contactId)).length;

  const byAdMap = new Map<string, number>();
  for (const l of adLeads) {
    const key = l.adModel ?? l.adTitle ?? "Anúncio (sem título)";
    byAdMap.set(key, (byAdMap.get(key) ?? 0) + 1);
  }

  const total = convs.length;
  return {
    leads: total,
    responded,
    unanswered: total - responded,
    responseRate: total ? responded / total : 0,
    avgFirstResponseSec: mean(times),
    medianFirstResponseSec: median(times),
    buckets,
    byOrigin: { ad: adCount, organic: total - adCount },
    byAd: [...byAdMap.entries()].map(([adTitle, total]) => ({ adTitle, total })).sort((a, b) => b.total - a.total),
    series: [...seriesMap.entries()].map(([date, leads]) => ({ date, leads })).sort((a, b) => a.date.localeCompare(b.date)),
    funnel,
    waitingNow,
    alerts: {
      waiting: alertRows.length,
      abandoned: alertRows.filter((r) => r.lastMessageAt && r.lastMessageAt < abandonedCut).length,
      sample: alertRows.slice(0, 12).map((r) => ({
        contactId: r.contactId,
        name: r.contact.name,
        waId: r.contact.waId,
        waitingSince: r.lastMessageAt?.toISOString() ?? null,
      })),
    },
  };
}

// ── Métricas de atendimento dos leads de anúncio ─────────────────────────────
// Foco: provar que o tráfego trouxe leads reais e medir a QUALIDADE do
// atendimento (taxa de resposta, leads ignorados, tempo de 1ª resposta).

export interface AdMetric {
  adTitle: string;
  total: number;
  responded: number;
  unanswered: number;
  avgFirstResponseSec: number | null;
}

export interface AttendanceMetrics {
  total: number;            // leads de anúncio no período
  responded: number;        // que receberam ao menos 1 resposta
  unanswered: number;       // ignorados (o vazamento)
  responseRate: number;     // 0..1
  avgFirstResponseSec: number | null;    // tempo médio de 1ª resposta
  medianFirstResponseSec: number | null; // mediana (mais robusta)
  buckets: { upTo5min: number; upTo30min: number; upTo1h: number; over1h: number; unanswered: number };
  perAd: AdMetric[];
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Formata segundos em texto curto: "3 min", "1h 12min", "2 dias".
export function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

export async function computeAttendanceMetrics(
  connectionId: string,
  start: Date,
  end: Date,
): Promise<AttendanceMetrics> {
  const leads = await prisma.waLead.findMany({
    where: { connectionId, enteredAt: { gte: start, lt: end } },
    orderBy: { enteredAt: "desc" },
  });

  const contactIds = [...new Set(leads.map((l) => l.contactId))];

  // Mensagens enviadas (respostas) desses contatos, ordenadas por data
  const outbounds = contactIds.length
    ? await prisma.waMessage.findMany({
        where: { contactId: { in: contactIds }, direction: "out" },
        select: { contactId: true, timestamp: true },
        orderBy: { timestamp: "asc" },
      })
    : [];

  const outByContact = new Map<string, Date[]>();
  for (const m of outbounds) {
    const arr = outByContact.get(m.contactId) ?? [];
    arr.push(m.timestamp);
    outByContact.set(m.contactId, arr);
  }

  const buckets = { upTo5min: 0, upTo30min: 0, upTo1h: 0, over1h: 0, unanswered: 0 };
  const perAdMap = new Map<string, { total: number; responded: number; times: number[] }>();
  const allTimes: number[] = [];
  let responded = 0;

  for (const lead of leads) {
    // 1ª resposta = 1ª mensagem enviada após a entrada do lead
    const outs = outByContact.get(lead.contactId) ?? [];
    const firstReply = outs.find((t) => t.getTime() >= lead.enteredAt.getTime());
    const sec = firstReply ? (firstReply.getTime() - lead.enteredAt.getTime()) / 1000 : null;

    const key = lead.adModel ?? lead.adTitle ?? "Anúncio (sem título)";
    const ad = perAdMap.get(key) ?? { total: 0, responded: 0, times: [] };
    ad.total++;

    if (sec != null) {
      responded++;
      allTimes.push(sec);
      ad.responded++;
      ad.times.push(sec);
      if (sec <= 300) buckets.upTo5min++;
      else if (sec <= 1800) buckets.upTo30min++;
      else if (sec <= 3600) buckets.upTo1h++;
      else buckets.over1h++;
    } else {
      buckets.unanswered++;
    }
    perAdMap.set(key, ad);
  }

  const total = leads.length;
  const perAd: AdMetric[] = [...perAdMap.entries()]
    .map(([adTitle, v]) => ({
      adTitle,
      total: v.total,
      responded: v.responded,
      unanswered: v.total - v.responded,
      avgFirstResponseSec: mean(v.times),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total,
    responded,
    unanswered: total - responded,
    responseRate: total ? responded / total : 0,
    avgFirstResponseSec: mean(allTimes),
    medianFirstResponseSec: median(allTimes),
    buckets,
    perAd,
  };
}
