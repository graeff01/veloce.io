import { prisma } from "@/lib/prisma";
import { computeOverview } from "@/lib/wa-metrics";
import { computeMetaAdsView } from "@/lib/meta-ads-view";

// ── Relatório de reunião (1 artefato de decisão) ─────────────────────────────
// Fonte ÚNICA: tudo deriva de computeOverview (WhatsApp/atendimento) e
// computeMetaAdsView (mídia). Nada é recalculado por fora — coerência total com
// Painel, PDF de Anúncios e Diagnóstico. Quando um dado não existe, é null e o
// PDF mostra "indisponível": nunca estima.
//
// Objetivo do documento: identificar O gargalo do mês, traduzir em R$, recomendar
// a solução e mostrar o resultado que o cliente quer ver. Curto e opinativo.

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export interface ReportMetric { value: number | null; growthPct: number | null }

// Item do placar: um fato medido (número + o que ele significa).
export interface ScorecardItem { metric: string; label: string }

export interface Bottleneck {
  title: string;        // o gargalo, em poucas palavras
  headline: string;     // 1 frase de impacto
  metricLabel: string;  // rótulo do número-chave
  metricValue: string;  // número-chave (já formatado)
  costValue: string | null;   // prejuízo em R$ (ou null se não dá pra medir)
  costNote: string | null;    // como o R$ foi calculado (transparência)
  why: string;          // por que isso acontece / o que significa
  solution: string;     // a recomendação (aponta pra solução)
  expected: string;     // o que muda se agir
}

export interface ClientReportData {
  clientName: string;
  periodLabel: string;
  prevPeriodLabel: string;
  generatedAt: string;
  hasData: boolean;

  health: { score: number; label: string; color: string };
  scorecard: { wins: ScorecardItem[]; concerns: ScorecardItem[] };
  bottleneck: Bottleneck | null;

  // O que o cliente quer ver (resultado)
  results: {
    leads: ReportMetric;
    conversoes: ReportMetric;
    taxaAtendimentoPct: number | null;
    tempoMedianoSec: number | null;
    investimento: number | null;
    cplReal: number | null;
    adLeads: number | null;
  };

  // Provas (página 2)
  attendance: {
    respondidos: number;
    semResposta: number;
    over1h: number;
    buckets: { upTo5min: number; upTo30min: number; upTo1h: number; over1h: number; unanswered: number };
  };
  offHours: { pct: number | null; peakHour: number | null };
}

const RED = "#B42318", AMBER = "#B45309", GREEN = "#16A34A";

function growth(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

export async function computeClientReport(clientId: string, year: number, month: number): Promise<ClientReportData | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return null;

  const periodLabel = `${MONTHS[month - 1]} de ${year}`;
  const prevDate = new Date(year, month - 2, 1);
  const prevPeriodLabel = `${MONTHS[prevDate.getMonth()]} de ${prevDate.getFullYear()}`;
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const conn = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });
  if (!conn) return empty(client.name, periodLabel, prevPeriodLabel, generatedAt);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const prevStart = new Date(year, month - 2, 1);

  const [cur, prev, ads] = await Promise.all([
    computeOverview(conn.id, start, end),
    computeOverview(conn.id, prevStart, start),
    computeMetaAdsView(clientId, start, end),
  ]);

  // ── O relatório é sobre os leads de ANÚNCIO (mídia paga) — não os totais ──
  const A = cur.adAttendance;
  const prevA = prev.adAttendance;
  const hasData = A.leads > 0;

  const respRate = A.leads ? A.responded / A.leads : 0;
  const median = A.medianFirstResponseSec;
  const offPct = A.offHoursPct;
  const peakHour = A.peakHour;
  const wasted = ads.totals.cpl != null && A.unanswered > 0 ? ads.totals.cpl * A.unanswered : null;

  // ── Score de saúde (cobertura + velocidade dos leads de anúncio) ──
  let score = Math.round(respRate * 100);
  if (median != null && median > 600) score -= Math.min(25, Math.round((median - 600) / 120)); // > 10min penaliza
  if (A.over1h > 0 && A.leads) score -= Math.min(15, Math.round((A.over1h / A.leads) * 100));
  score = Math.max(0, Math.min(100, score));
  const health = score >= 80
    ? { score, label: "Saudável", color: GREEN }
    : score >= 50
      ? { score, label: "Atenção", color: AMBER }
      : { score, label: "Crítico", color: RED };

  // ── Resultado (o que o cliente quer ver) ──
  const results = {
    leads: { value: A.leads, growthPct: growth(A.leads, prevA.leads || null) },
    conversoes: { value: A.converted, growthPct: growth(A.converted, prevA.converted || null) },
    taxaAtendimentoPct: A.leads ? Math.round(respRate * 100) : null,
    tempoMedianoSec: median,
    investimento: ads.connected ? ads.totals.spend : null,
    cplReal: ads.totals.cpl,
    adLeads: A.leads,
  };

  const bottleneck = hasData ? pickBottleneck(A, { offPct, peakHour, wasted, cpl: ads.totals.cpl }) : null;

  // ── Placar: acertos × pontos de atenção (fatos medidos, sem opinião) ──
  const wins: ScorecardItem[] = [];
  const concerns: ScorecardItem[] = [];
  if (hasData) {
    const respPct = Math.round(respRate * 100);
    if (respPct >= 85) wins.push({ metric: `${respPct}%`, label: "dos leads de anúncio respondidos" });
    else concerns.push({ metric: String(A.unanswered), label: `leads de anúncio sem resposta${wasted != null ? ` (${brl(wasted)})` : ""}` });

    if (median != null) {
      if (median <= 600) wins.push({ metric: fmtDur(median), label: "de resposta (mediana) — dentro da janela" });
      else concerns.push({ metric: fmtDur(median), label: "de espera mediana pela 1ª resposta" });
    }

    if (A.over1h > 0) concerns.push({ metric: String(A.over1h), label: "respostas levaram mais de 1 hora" });
    else if (A.responded > 0) wins.push({ metric: "0", label: "respostas acima de 1 hora" });

    const lg = results.leads.growthPct;
    if (lg != null && lg > 0) wins.push({ metric: `+${lg}%`, label: "em leads de anúncio vs mês anterior" });
    else if (lg != null && lg < 0) concerns.push({ metric: `${lg}%`, label: "em leads de anúncio vs mês anterior" });

    const cg = results.conversoes.growthPct;
    if (cg != null && cg > 0) wins.push({ metric: `+${cg}%`, label: "em conversões vs mês anterior" });
    else if (cg != null && cg < 0) concerns.push({ metric: `${cg}%`, label: "em conversões vs mês anterior" });

    if (offPct != null && offPct >= 40) concerns.push({ metric: `${offPct}%`, label: "dos leads de anúncio chegam fora do horário" });

    if (wins.length === 0) wins.push({ metric: "—", label: "sem destaques positivos no período" });
    if (concerns.length === 0) concerns.push({ metric: "0", label: "pontos críticos no período" });
  }
  const scorecard = { wins: wins.slice(0, 4), concerns: concerns.slice(0, 4) };

  return {
    clientName: client.name,
    periodLabel,
    prevPeriodLabel,
    generatedAt,
    hasData,
    health,
    scorecard,
    bottleneck,
    results,
    attendance: {
      respondidos: A.responded,
      semResposta: A.unanswered,
      over1h: A.over1h,
      buckets: A.buckets,
    },
    offHours: { pct: offPct, peakHour },
  };
}

// ── Motor de gargalo ─────────────────────────────────────────────────────────
// Escolhe UM gargalo dos leads de ANÚNCIO — o de maior impacto. Prioriza o que
// custa dinheiro real (mídia paga ignorada), depois velocidade.
type AdAtt = Awaited<ReturnType<typeof computeOverview>>["adAttendance"];
function pickBottleneck(
  A: AdAtt,
  ctx: { offPct: number | null; peakHour: number | null; wasted: number | null; cpl: number | null },
): Bottleneck {
  const adUnanswered = A.unanswered;
  const cpl = ctx.cpl;
  const wasted = ctx.wasted;
  const median = A.medianFirstResponseSec;
  const offLine = ctx.offPct != null && ctx.offPct >= 40
    ? ` Boa parte chega fora do horário comercial (${ctx.offPct}%), quando ninguém está atendendo.`
    : "";

  // 1) Leads de anúncio ignorados — custa mídia de verdade.
  if (adUnanswered > 0 && (wasted != null || A.leads >= 3)) {
    return {
      title: "Leads de anúncio ficando sem resposta",
      headline: `${adUnanswered} lead${adUnanswered !== 1 ? "s" : ""} de anúncio não receberam retorno — você pagou pela mídia e o lead esfriou esperando.`,
      metricLabel: "Leads de anúncio ignorados",
      metricValue: String(adUnanswered),
      costValue: wasted != null ? brl(wasted) : null,
      costNote: wasted != null ? `${adUnanswered} leads ignorados × CPL real ${brl(cpl!)}` : null,
      why: `Cada lead de anúncio que entra e não é respondido é dinheiro de mídia jogado fora.${offLine}`,
      solution: "Atendimento automático para responder na hora (inclusive fora do horário) e reforço de cobertura nos picos — garantindo que nenhum lead pago fique sem resposta.",
      expected: "Recuperar leads que hoje esfriam esperando e transformar mídia desperdiçada em conversa — sem aumentar o investimento.",
    };
  }

  // 2) Velocidade — responde, mas devagar.
  if (median != null && median > 600) {
    return {
      title: "Tempo de resposta acima da janela de conversão",
      headline: `Metade dos leads de anúncio esperou mais de ${fmtDur(median)} pela primeira resposta — muito além dos ~10 min em que o lead ainda está quente.`,
      metricLabel: "Tempo mediano de resposta",
      metricValue: fmtDur(median),
      costValue: null,
      costNote: null,
      why: `Quanto mais o lead pago espera, mais ele esfria e procura o concorrente.${offLine}`,
      solution: "Primeira resposta automática e imediata para segurar o lead, com a equipe assumindo a conversa em seguida.",
      expected: "Trazer a primeira resposta para minutos e aproveitar a janela em que o lead converte.",
    };
  }

  // Operação saudável — sem gargalo crítico.
  const respRate = A.leads ? A.responded / A.leads : 1;
  return {
    title: "Atendimento dos anúncios saudável",
    headline: "Nenhum gargalo crítico no período: os leads de anúncio foram respondidos com boa cobertura e velocidade.",
    metricLabel: "Atendimento dos anúncios",
    metricValue: `${Math.round(respRate * 100)}%`,
    costValue: null,
    costNote: null,
    why: "O atendimento acompanhou o volume de leads de anúncio no período.",
    solution: "Manter o padrão e focar na qualificação e conversão dos leads já atendidos.",
    expected: "Sustentar o nível de atendimento e direcionar esforço para o fechamento.",
  };
}

function empty(clientName: string, periodLabel: string, prevPeriodLabel: string, generatedAt: string): ClientReportData {
  return {
    clientName, periodLabel, prevPeriodLabel, generatedAt, hasData: false,
    health: { score: 0, label: "Sem dados", color: "#94A3B8" },
    scorecard: { wins: [], concerns: [] },
    bottleneck: null,
    results: { leads: { value: null, growthPct: null }, conversoes: { value: null, growthPct: null }, taxaAtendimentoPct: null, tempoMedianoSec: null, investimento: null, cplReal: null, adLeads: null },
    attendance: { respondidos: 0, semResposta: 0, over1h: 0, buckets: { upTo5min: 0, upTo30min: 0, upTo1h: 0, over1h: 0, unanswered: 0 } },
    offHours: { pct: null, peakHour: null },
  };
}
