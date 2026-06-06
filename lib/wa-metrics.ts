import { prisma } from "@/lib/prisma";

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

    const key = lead.adTitle ?? "Anúncio (sem título)";
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
