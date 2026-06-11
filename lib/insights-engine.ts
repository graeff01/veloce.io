import type { ExecutiveReportData } from "@/lib/executive-report";
import type { MetaAdsView } from "@/lib/meta-ads-view";

// ── Motor de insights (determinístico) ───────────────────────────────────────
// Transforma o dado real (mês atual vs anterior, geral + por anúncio) em alertas
// e destaques tipados. Sem IA, sem custo, instantâneo e confiável — a IA entra
// só depois, para narrar (lib/insights-narrative).

export type InsightSeverity = "critical" | "warning" | "positive" | "info";
export type InsightCategory = "ads" | "attendance" | "funnel" | "leads";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  detail: string;
}

function growth(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}
const r = (n: number) => Math.round(n);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SEV_ORDER: Record<InsightSeverity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };

export function buildInsights(input: {
  report: ExecutiveReportData;
  adsCur: MetaAdsView;
  adsPrev: MetaAdsView;
}): Insight[] {
  const { report, adsCur, adsPrev } = input;
  const out: Insight[] = [];
  const push = (i: Insight) => out.push(i);

  // ── ADS: CPL geral ──
  const cplG = growth(adsCur.totals.cpl, adsPrev.totals.cpl);
  if (cplG != null && cplG <= -5) push({ id: "cpl-down", severity: "positive", category: "ads", title: `CPL caiu ${Math.abs(r(cplG))}%`, detail: `O custo por lead caiu de ${brl(adsPrev.totals.cpl ?? 0)} para ${brl(adsCur.totals.cpl ?? 0)} em relação ao período anterior.` });
  else if (cplG != null && cplG >= 12) push({ id: "cpl-up", severity: "warning", category: "ads", title: `CPL subiu ${r(cplG)}%`, detail: `O custo por lead subiu para ${brl(adsCur.totals.cpl ?? 0)}. Vale revisar criativos e segmentação.` });

  // ── ADS: eficiência (gasto sobe, leads caem) ──
  const spendG = growth(adsCur.totals.spend, adsPrev.totals.spend || null);
  const adLeadG = growth(adsCur.totals.leads, adsPrev.totals.leads || null);
  if (spendG != null && adLeadG != null && spendG > 8 && adLeadG < -8) {
    push({ id: "efficiency-drop", severity: "critical", category: "ads", title: "Investimento subindo, leads caindo", detail: `O investimento subiu ${r(spendG)}% mas as oportunidades caíram ${Math.abs(r(adLeadG))}% — a eficiência da mídia piorou no período.` });
  } else if (adLeadG != null && adLeadG >= 12) {
    push({ id: "leads-up", severity: "positive", category: "leads", title: `Oportunidades cresceram ${r(adLeadG)}%`, detail: `O volume de leads de anúncio aumentou em relação ao período anterior.` });
  }

  // ── ADS: por anúncio (winner, spike, parou de converter) ──
  if (adsCur.ads.length > 0) {
    const withLeads = adsCur.ads.filter((a) => a.leads > 0 && a.cpl != null);
    if (withLeads.length > 0) {
      const best = withLeads.reduce((b, a) => (a.cpl! < b.cpl! ? a : b));
      push({ id: "ad-winner", severity: "positive", category: "ads", title: `Melhor anúncio: ${best.name}`, detail: `Tem o menor CPL real (${brl(best.cpl!)}) com ${best.leads} lead(s). Considere escalar o investimento nele.` });
    }
    const prevById = new Map(adsPrev.ads.map((a) => [a.adId, a]));
    for (const a of adsCur.ads) {
      const p = prevById.get(a.adId);
      if (!p) continue;
      const g = growth(a.cpl, p.cpl);
      if (g != null && g >= 30 && a.spend > 0) {
        push({ id: `ad-spike-${a.adId}`, severity: "warning", category: "ads", title: `CPL do anúncio "${a.name}" subiu ${r(g)}%`, detail: `Passou de ${brl(p.cpl ?? 0)} para ${brl(a.cpl ?? 0)}. Anúncio pode estar saturando.` });
      }
      if (p.leads > 0 && a.leads === 0 && a.spend > 0) {
        push({ id: `ad-stopped-${a.adId}`, severity: "warning", category: "ads", title: `Anúncio "${a.name}" parou de converter`, detail: `Tinha ${p.leads} lead(s) no período anterior e está gastando sem gerar oportunidades agora.` });
      }
    }
  }

  // ── ATENDIMENTO ──
  const att = report.attendance.attendanceRatePct;
  if (att != null && att < 85) push({ id: "attendance-low", severity: "warning", category: "attendance", title: `Taxa de atendimento em ${r(att)}%`, detail: `Está abaixo do ideal (90%). Há oportunidades chegando sem resposta adequada.` });
  if (report.attendance.unanswered > 0) push({ id: "unanswered", severity: report.attendance.unanswered > 3 ? "critical" : "warning", category: "attendance", title: `${report.attendance.unanswered} oportunidade(s) sem resposta`, detail: `Leads que chegaram e não foram respondidos no período — receita potencial perdida.` });

  const respG = growth(report.kpis.avgResponseSec.value, report.kpis.avgResponseSec.prev);
  if (respG != null && respG >= 15) push({ id: "response-slower", severity: "warning", category: "attendance", title: `Resposta ${r(respG)}% mais lenta`, detail: `O tempo médio de resposta piorou em relação ao período anterior.` });
  else if (respG != null && respG <= -15) push({ id: "response-faster", severity: "positive", category: "attendance", title: `Resposta ${Math.abs(r(respG))}% mais rápida`, detail: `O atendimento melhorou a velocidade de resposta no período.` });

  if (report.behavior.peakHour != null) {
    push({ id: "peak-hour", severity: "info", category: "attendance", title: `Pico de demanda às ${String(report.behavior.peakHour).padStart(2, "0")}h`, detail: `É o horário com mais entradas — garanta cobertura de atendimento nesse período.` });
  }

  // ── FUNIL ──
  const f = report.funnel;
  if (f.recebido > 0) {
    const atendidoRate = f.atendido / f.recebido;
    if (atendidoRate < 0.7) push({ id: "funnel-attend", severity: "warning", category: "funnel", title: `Só ${r(atendidoRate * 100)}% dos leads foram atendidos`, detail: `O maior gargalo está logo na entrada — leads chegam mas não são atendidos.` });
    const adLeads = adsCur.totals.leads;
    const convRate = adLeads > 0 ? (f.convertido / adLeads) * 100 : null;
    if (convRate != null && convRate >= 10) push({ id: "conv-high", severity: "positive", category: "funnel", title: `Conversão de ${r(convRate)}%`, detail: `O atendimento está convertendo oportunidades acima da média de mercado.` });
    if (f.negociacao > 0 && f.convertido === 0) push({ id: "neg-stuck", severity: "info", category: "funnel", title: `${f.negociacao} em negociação, 0 fechadas`, detail: `Há negociações em aberto sem conversão — vale um empurrão no acompanhamento.` });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).slice(0, 8);
}
