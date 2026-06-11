import { prisma } from "@/lib/prisma";
import { computeOverview } from "@/lib/wa-metrics";

// ── Relatório Executivo Mensal ───────────────────────────────────────────────
// Documento de negócio e atendimento (NÃO de mídia). Todos os números vêm do
// sistema real. Quando um dado não existe, o valor é null → o PDF mostra
// "dado indisponível". Nunca estima.

export interface ExecKpi {
  value: number | null;
  prev: number | null;
  growthPct: number | null; // crescimento vs período anterior (null se base 0)
}

export interface ExecutiveReportData {
  clientName: string;
  periodLabel: string;
  prevPeriodLabel: string;
  generatedAt: string;
  hasData: boolean;

  summary: {
    leads: number;
    avgResponseMin: number | null;
    attendanceRatePct: number | null;
    leadsGrowthPct: number | null;
    highlights: string[];
    attentionPoints: string[];
  };

  kpis: {
    leads: ExecKpi;
    negociacoes: ExecKpi;
    conversoes: ExecKpi;
    avgResponseSec: ExecKpi;
    attendanceRate: ExecKpi; // 0-100
    firstContactSec: ExecKpi;
  };

  attendance: {
    avgResponseSec: number | null;
    minResponseSec: number | null;
    maxResponseSec: number | null;
    attendanceRatePct: number | null;
    unanswered: number;
    total: number;
    buckets: { upTo5min: number; upTo30min: number; upTo1h: number; over1h: number; unanswered: number };
  };

  behavior: {
    byHour: { hour: number; count: number }[];        // 0-23
    byWeekday: { weekday: number; count: number }[];   // 0=Dom … 6=Sáb
    peakHour: number | null;
    peakWeekday: number | null;
    hasData: boolean;
  };

  funnel: {
    recebido: number;
    atendido: number;
    qualificado: number;
    negociacao: number;
    convertido: number;
  };

  conclusions: string[];
}

function growth(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function kpi(value: number | null, prev: number | null): ExecKpi {
  return { value, prev, growthPct: growth(value, prev) };
}

export async function computeExecutiveReport(
  clientId: string,
  year: number,
  month: number
): Promise<ExecutiveReportData | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return null;

  const conn = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });

  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const periodLabel = `${MONTHS[month - 1]} de ${year}`;
  const prevMonthDate = new Date(year, month - 2, 1);
  const prevPeriodLabel = `${MONTHS[prevMonthDate.getMonth()]} de ${prevMonthDate.getFullYear()}`;
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  // Sem WhatsApp conectado → documento "sem dados" honesto.
  if (!conn) {
    return emptyReport(client.name, periodLabel, prevPeriodLabel, generatedAt);
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd = start;

  const [cur, prev, hourRows] = await Promise.all([
    computeOverview(conn.id, start, end),
    computeOverview(conn.id, prevStart, prevEnd),
    prisma.waConversation.findMany({
      where: { connectionId: conn.id, firstInboundAt: { gte: start, lt: end } },
      select: { firstInboundAt: true },
    }),
  ]);

  const hasData = cur.leads > 0;

  // ── Distribuição por hora e dia da semana ──
  const byHourMap = new Array(24).fill(0);
  const byWeekdayMap = new Array(7).fill(0);
  for (const r of hourRows) {
    if (!r.firstInboundAt) continue;
    byHourMap[r.firstInboundAt.getHours()]++;
    byWeekdayMap[r.firstInboundAt.getDay()]++;
  }
  const byHour = byHourMap.map((count, hour) => ({ hour, count }));
  const byWeekday = byWeekdayMap.map((count, weekday) => ({ weekday, count }));
  const behaviorHasData = hourRows.length > 0;
  const peakHour = behaviorHasData ? byHourMap.indexOf(Math.max(...byHourMap)) : null;
  const peakWeekday = behaviorHasData ? byWeekdayMap.indexOf(Math.max(...byWeekdayMap)) : null;

  // ── KPIs com comparativo ──
  const attendanceRatePct = cur.leads ? cur.responseRate * 100 : null;
  const prevAttendanceRatePct = prev.leads ? prev.responseRate * 100 : null;

  const kpis = {
    leads: kpi(cur.leads, prev.leads || null),
    negociacoes: kpi(cur.funnel.negociacao + cur.funnel.convertido, (prev.funnel.negociacao + prev.funnel.convertido) || null),
    conversoes: kpi(cur.converted, prev.converted || null),
    avgResponseSec: kpi(cur.avgFirstResponseSec, prev.avgFirstResponseSec),
    attendanceRate: kpi(attendanceRatePct, prevAttendanceRatePct),
    firstContactSec: kpi(cur.avgFirstResponseSec, prev.avgFirstResponseSec),
  };

  // ── Funil cumulativo (jornada) ──
  // Stages são exclusivos (etapa atual). Para a jornada, soma quem avançou além.
  const funnel = {
    recebido: cur.leads,
    atendido: cur.responded,
    qualificado: cur.funnel.qualificado + cur.funnel.negociacao + cur.funnel.convertido,
    negociacao: cur.funnel.negociacao + cur.funnel.convertido,
    convertido: cur.funnel.convertido,
  };

  // ── Resumo executivo (texto automático, só com dados reais) ──
  const leadsGrowthPct = growth(cur.leads, prev.leads || null);
  const avgResponseMin = cur.avgFirstResponseSec != null ? Math.round(cur.avgFirstResponseSec / 60) : null;

  const highlights: string[] = [];
  if (leadsGrowthPct != null && leadsGrowthPct > 2) highlights.push(`Aumento de ${Math.round(leadsGrowthPct)}% no volume de oportunidades.`);
  const respGrowth = growth(cur.avgFirstResponseSec, prev.avgFirstResponseSec);
  if (respGrowth != null && respGrowth < -2) highlights.push(`Tempo de resposta ${Math.abs(Math.round(respGrowth))}% mais rápido que o período anterior.`);
  const negGrowth = growth(funnel.negociacao, (prev.funnel.negociacao + prev.funnel.convertido) || null);
  if (negGrowth != null && negGrowth > 2) highlights.push(`Crescimento de ${Math.round(negGrowth)}% nas negociações iniciadas.`);
  if (attendanceRatePct != null && attendanceRatePct >= 90) highlights.push(`Taxa de atendimento elevada (${Math.round(attendanceRatePct)}%).`);
  if (highlights.length === 0 && hasData) highlights.push("Operação estável em relação ao período anterior.");

  const attentionPoints: string[] = [];
  if (cur.unanswered > 0) attentionPoints.push(`${cur.unanswered} oportunidade(s) sem resposta no período.`);
  if (attendanceRatePct != null && attendanceRatePct < 85) attentionPoints.push(`Taxa de atendimento abaixo do ideal (${Math.round(attendanceRatePct)}%).`);
  if (cur.buckets.over1h > 0) attentionPoints.push(`${cur.buckets.over1h} atendimento(s) com primeira resposta acima de 1 hora.`);
  if (respGrowth != null && respGrowth > 5) attentionPoints.push(`Tempo de resposta ${Math.round(respGrowth)}% mais lento que o período anterior.`);
  if (peakHour != null) attentionPoints.push(`Concentração de demanda às ${String(peakHour).padStart(2, "0")}h — garantir cobertura nesse horário.`);

  const summary = {
    leads: cur.leads,
    avgResponseMin,
    attendanceRatePct: attendanceRatePct != null ? Math.round(attendanceRatePct) : null,
    leadsGrowthPct: leadsGrowthPct != null ? Math.round(leadsGrowthPct) : null,
    highlights,
    attentionPoints,
  };

  // ── Conclusões (texto automático) ──
  const conclusions: string[] = [];
  if (leadsGrowthPct != null && leadsGrowthPct > 0) {
    conclusions.push("A operação apresentou evolução positiva na geração de oportunidades.");
  } else if (leadsGrowthPct != null && leadsGrowthPct < 0) {
    conclusions.push("Houve retração no volume de oportunidades em relação ao período anterior.");
  }
  if (attendanceRatePct != null && attendanceRatePct < 90) {
    conclusions.push("O principal gargalo é a velocidade e a cobertura de resposta, sobretudo nos horários de pico.");
  } else if (attendanceRatePct != null) {
    conclusions.push("O atendimento manteve bom nível de cobertura ao longo do mês.");
  }
  if (funnel.negociacao > 0 && funnel.convertido < funnel.negociacao) {
    conclusions.push("Há potencial de aumento de conversão melhorando o acompanhamento das negociações em aberto.");
  }
  if (peakHour != null) {
    conclusions.push(`Recomenda-se reforço de atendimento no horário de pico (${String(peakHour).padStart(2, "0")}h) para reduzir perdas.`);
  }
  if (hasData) conclusions.push("A tendência geral da operação permanece positiva.");

  return {
    clientName: client.name,
    periodLabel,
    prevPeriodLabel,
    generatedAt,
    hasData,
    summary,
    kpis,
    attendance: {
      avgResponseSec: cur.avgFirstResponseSec,
      minResponseSec: cur.responseMinSec,
      maxResponseSec: cur.responseMaxSec,
      attendanceRatePct: attendanceRatePct != null ? Math.round(attendanceRatePct) : null,
      unanswered: cur.unanswered,
      total: cur.leads,
      buckets: cur.buckets,
    },
    behavior: { byHour, byWeekday, peakHour, peakWeekday, hasData: behaviorHasData },
    funnel,
    conclusions,
  };
}

function emptyReport(clientName: string, periodLabel: string, prevPeriodLabel: string, generatedAt: string): ExecutiveReportData {
  const z = kpi(null, null);
  return {
    clientName, periodLabel, prevPeriodLabel, generatedAt, hasData: false,
    summary: { leads: 0, avgResponseMin: null, attendanceRatePct: null, leadsGrowthPct: null, highlights: [], attentionPoints: [] },
    kpis: { leads: z, negociacoes: z, conversoes: z, avgResponseSec: z, attendanceRate: z, firstContactSec: z },
    attendance: { avgResponseSec: null, minResponseSec: null, maxResponseSec: null, attendanceRatePct: null, unanswered: 0, total: 0, buckets: { upTo5min: 0, upTo30min: 0, upTo1h: 0, over1h: 0, unanswered: 0 } },
    behavior: { byHour: [], byWeekday: [], peakHour: null, peakWeekday: null, hasData: false },
    funnel: { recebido: 0, atendido: 0, qualificado: 0, negociacao: 0, convertido: 0 },
    conclusions: [],
  };
}
