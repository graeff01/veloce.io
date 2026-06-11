import { computeExecutiveReport, type ExecutiveReportData } from "@/lib/executive-report";
import { computeMetaAdsView } from "@/lib/meta-ads-view";

// ── Camada de dados do acesso CLIENTE ────────────────────────────────────────
// Consolida o lado de NEGÓCIO/ATENDIMENTO (executive-report) com o lado de
// RESULTADO de mídia (meta-ads-view), gerando insights automáticos. Tudo real;
// nada estimado. O clientId vem sempre da sessão (nunca do request).

export interface ClientAdsSummary {
  hasData: boolean;
  spend: number;
  leads: number;             // oportunidades atribuídas a anúncio (reais, WhatsApp)
  cpl: number | null;        // CPL real
  conversoes: number;        // conversões reais (geral)
  taxaConversao: number | null;
  spendGrowth: number | null;
  leadsGrowth: number | null;
  cplGrowth: number | null;
  insights: string[];
}

export interface ClientSummary {
  clientName: string;
  periodLabel: string;
  prevPeriodLabel: string;
  business: ExecutiveReportData;
  ads: ClientAdsSummary;
}

function growth(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export async function computeClientSummary(clientId: string, year: number, month: number): Promise<ClientSummary | null> {
  const business = await computeExecutiveReport(clientId, year, month);
  if (!business) return null;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd = start;

  const [cur, prev] = await Promise.all([
    computeMetaAdsView(clientId, start, end),
    computeMetaAdsView(clientId, prevStart, prevEnd),
  ]);

  const conversoes = business.funnel.convertido;
  const adLeads = cur.totals.leads;
  const taxaConversao = adLeads > 0 ? (conversoes / adLeads) * 100 : null;

  const spendGrowth = growth(cur.totals.spend, prev.totals.spend || null);
  const leadsGrowth = growth(cur.totals.leads, prev.totals.leads || null);
  const cplGrowth = growth(cur.totals.cpl, prev.totals.cpl);

  // ── Insights automáticos (só com dados reais) ──
  const insights: string[] = [];
  if (cplGrowth != null && cplGrowth < -2) insights.push(`O CPL reduziu ${Math.abs(Math.round(cplGrowth))}% em relação ao período anterior.`);
  else if (cplGrowth != null && cplGrowth > 2) insights.push(`O CPL aumentou ${Math.round(cplGrowth)}% em relação ao período anterior.`);
  if (leadsGrowth != null && leadsGrowth > 2) insights.push(`O volume de oportunidades aumentou ${Math.round(leadsGrowth)}%.`);
  else if (leadsGrowth != null && leadsGrowth < -2) insights.push(`O volume de oportunidades caiu ${Math.abs(Math.round(leadsGrowth))}%.`);
  if (spendGrowth != null && Math.abs(spendGrowth) > 5) insights.push(`O investimento ${spendGrowth > 0 ? "subiu" : "reduziu"} ${Math.abs(Math.round(spendGrowth))}% no período.`);
  if (taxaConversao != null && taxaConversao >= 10) insights.push("O atendimento está convertendo acima da média do mercado.");
  if (business.summary.attendanceRatePct != null && business.summary.attendanceRatePct >= 90) insights.push(`A taxa de atendimento se manteve elevada (${business.summary.attendanceRatePct}%).`);
  if (insights.length === 0 && cur.hasData) insights.push("Resultados estáveis em relação ao período anterior.");

  return {
    clientName: business.clientName,
    periodLabel: business.periodLabel,
    prevPeriodLabel: business.prevPeriodLabel,
    business,
    ads: {
      hasData: cur.hasData,
      spend: cur.totals.spend,
      leads: adLeads,
      cpl: cur.totals.cpl,
      conversoes,
      taxaConversao,
      spendGrowth,
      leadsGrowth,
      cplGrowth,
      insights,
    },
  };
}
