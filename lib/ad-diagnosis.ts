import { prisma } from "@/lib/prisma";
import { computeMetaAdsView } from "@/lib/meta-ads-view";
import { onlyDigits } from "@/lib/whatsapp";

// ── Motor de diagnóstico individual de anúncio (determinístico) ──────────────
// Entende a MECÂNICA do algoritmo da Meta e cruza o dado modelado (Meta) com o
// REAL (referral/WhatsApp). Toda conclusão é ancorada em EVIDÊNCIA (os números
// que a geraram) e calibrada por CONFIANÇA (tamanho de amostra). Abaixo do
// limiar de amostra nunca há alarme — só "em aprendizado". Sem IA, sem custo.
//
// Princípios (1 ponto de verdade — ajuste os limiares aqui):
//   • Fase de aprendizado: não se julga anúncio novo/sem volume.
//   • Significância: só declara vencedor/perdedor com amostra mínima.
//   • CPL-alvo = baseline (mediana móvel do CPL real do próprio cliente).
//   • Saturação: CTR caindo (fadiga de criativo/público).

// ── Limiares (calibráveis) ───────────────────────────────────────────────────
const MIN_DAYS_TO_JUDGE = 3;        // anúncio com menos dias → ainda aprendendo
const SAMPLE_SPEND_MULT = 2;        // gasto >= 2× CPL-alvo p/ ter amostra de decisão
const SAMPLE_SPEND_ABS = 50;        // fallback quando não há baseline (R$)
const SAMPLE_IMPRESSIONS = 1000;    // ou impressões suficientes
const SANGRIA_SPEND_MULT = 3;       // gastou 3× o alvo e 0 lead real → sangria
const CPL_HIGH_MULT = 1.4;          // CPL real 40% acima do alvo → caro
const CTR_DECLINE_PCT = 30;         // queda de CTR (início→fim) que indica fadiga
const FREQ_SATURATION = 2.5;        // frequência média diária alta
const WIN_MIN_LEADS = 2;            // mínimo de leads reais p/ chamar de vencedor
const MODELED_GAP_RATIO = 0.4;      // real <= 40% do modelado → Meta superestima
const MODELED_MIN = 3;              // só sinaliza gap modelado com volume mínimo
const BASELINE_DAYS = 60;           // janela do baseline de CPL
const BASELINE_MIN_LEADS = 2;       // por anúncio, p/ entrar no baseline

export type AdSeverity = "critical" | "warning" | "positive" | "info" | "neutral";

export interface AdSignal { severity: AdSeverity; text: string }

export interface AdDiagnosis {
  adId: string;
  name: string;
  campaignName: string;
  status: string;
  severity: AdSeverity;
  scenario: string;
  title: string;
  action: string;
  confidence: "alta" | "media" | "baixa";
  evidence: string[];
  signals: AdSignal[];
  metrics: {
    daysLive: number | null;
    spend: number;
    realLeads: number;
    modeledLeads: number;
    realCpl: number | null;
    baselineCpl: number | null;
    ctr: number;
    ctrStart: number | null;
    ctrEnd: number | null;
    avgFrequency: number | null;
    dailyBudget: number | null;
    whatsappNumber: string | null;
    connectedNumber: string | null;
    learningStage: string | null;
    qualityRanking: string | null;
    engagementRanking: string | null;
    conversionRanking: string | null;
  };
}

export interface AdsDiagnosisResult {
  connected: boolean;
  hasData: boolean;
  baselineCpl: number | null;
  generatedAt: string;
  ads: AdDiagnosis[];
  counts: Record<AdSeverity, number>;
}

const SEV_ORDER: Record<AdSeverity, number> = { critical: 0, warning: 1, neutral: 2, positive: 3, info: 4 };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const isBelow = (r: string | null) => !!r && r.startsWith("BELOW_AVERAGE");

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function diagnoseAds(clientId: string, start: Date, end: Date): Promise<AdsDiagnosisResult> {
  const empty: AdsDiagnosisResult = {
    connected: false, hasData: false, baselineCpl: null, generatedAt: new Date().toISOString(),
    ads: [], counts: { critical: 0, warning: 0, positive: 0, info: 0, neutral: 0 },
  };

  const [metaConn, waConn] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }),
    prisma.waConnection.findUnique({ where: { clientId }, select: { id: true, displayPhone: true } }),
  ]);
  if (!metaConn) return empty;

  const trailingStart = new Date(end.getTime() - BASELINE_DAYS * 86400_000);
  const connectedNumber = waConn?.displayPhone ? onlyDigits(waConn.displayPhone) : null;

  // Atribuição real reaproveita o ÚNICO ponto de verdade (computeMetaAdsView).
  const [view, metaAds, adsets, dailyRows, trailingSpend, trailingLeads] = await Promise.all([
    computeMetaAdsView(clientId, start, end),
    prisma.metaAd.findMany({
      where: { connectionId: metaConn.id },
      select: {
        adId: true, name: true, campaignId: true, adsetId: true, status: true, startedAt: true,
        whatsappNumber: true, qualityRanking: true, engagementRanking: true, conversionRanking: true,
      },
    }),
    prisma.metaAdSet.findMany({
      where: { connectionId: metaConn.id },
      select: { adsetId: true, learningStage: true, dailyBudget: true, lifetimeBudget: true, destinationType: true },
    }),
    prisma.metaAdInsight.findMany({
      where: { connectionId: metaConn.id, date: { gte: start, lt: end } },
      select: { adId: true, date: true, ctr: true, frequency: true, impressions: true },
      orderBy: { date: "asc" },
    }),
    prisma.metaAdInsight.groupBy({
      by: ["adId"], where: { connectionId: metaConn.id, date: { gte: trailingStart, lt: end } }, _sum: { spend: true },
    }),
    waConn
      ? prisma.waLead.groupBy({
          by: ["adId"],
          where: { connectionId: waConn.id, adId: { not: null }, enteredAt: { gte: trailingStart, lt: end } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { adId: string | null; _count: { _all: number } }[]),
  ]);

  const adMeta = new Map(metaAds.map((a) => [a.adId, a]));
  const adsetMeta = new Map(adsets.map((s) => [s.adsetId, s]));

  // ── Baseline de CPL: mediana do CPL real por anúncio na janela móvel ──
  const tSpend = new Map<string, number>();
  for (const r of trailingSpend) tSpend.set(r.adId, r._sum.spend ?? 0);
  const tLeads = new Map<string, number>();
  for (const r of trailingLeads) if (r.adId) tLeads.set(r.adId, r._count._all);
  const perAdCpl: number[] = [];
  let aggSpend = 0, aggLeads = 0;
  for (const [adId, leads] of tLeads) {
    const spend = tSpend.get(adId) ?? 0;
    if (leads >= 1 && spend > 0) { aggSpend += spend; aggLeads += leads; }
    if (leads >= BASELINE_MIN_LEADS && spend > 0) perAdCpl.push(spend / leads);
  }
  const baselineCpl = perAdCpl.length >= 2 ? median(perAdCpl) : (aggLeads > 0 ? aggSpend / aggLeads : null);

  // ── Série diária por anúncio (tendência de CTR + frequência média) ──
  const daily = new Map<string, { ctr: number; freq: number; impr: number }[]>();
  const firstSeen = new Map<string, Date>(); // 1ª data com insight no período (fallback de idade)
  for (const r of dailyRows) {
    const arr = daily.get(r.adId) ?? [];
    arr.push({ ctr: r.ctr, freq: r.frequency, impr: r.impressions });
    daily.set(r.adId, arr);
    if (!firstSeen.has(r.adId)) firstSeen.set(r.adId, r.date); // dailyRows vem ordenado asc
  }
  function trend(adId: string): { ctrStart: number | null; ctrEnd: number | null; avgFreq: number | null; declinePct: number | null } {
    const s = daily.get(adId);
    if (!s || s.length < 3) {
      const withImpr = (s ?? []).filter((d) => d.impr > 0);
      const avgFreq = withImpr.length ? withImpr.reduce((a, d) => a + d.freq, 0) / withImpr.length : null;
      return { ctrStart: null, ctrEnd: null, avgFreq, declinePct: null };
    }
    const third = Math.max(1, Math.floor(s.length / 3));
    const avg = (xs: { ctr: number }[]) => xs.reduce((a, d) => a + d.ctr, 0) / xs.length;
    const ctrStart = avg(s.slice(0, third));
    const ctrEnd = avg(s.slice(-third));
    const withImpr = s.filter((d) => d.impr > 0);
    const avgFreq = withImpr.length ? withImpr.reduce((a, d) => a + d.freq, 0) / withImpr.length : null;
    const declinePct = ctrStart > 0 ? ((ctrStart - ctrEnd) / ctrStart) * 100 : null;
    return { ctrStart, ctrEnd, avgFreq, declinePct };
  }

  // Idade: preferimos created_time da Meta; sem ele, caímos para a 1ª data com
  // insight no período (subestima, mas evita "? dias" e nunca quebra).
  const daysLiveOf = (startedAt: Date | null, adId: string): number | null => {
    const ref = startedAt ?? firstSeen.get(adId) ?? null;
    return ref ? Math.max(0, Math.floor((end.getTime() - ref.getTime()) / 86400_000)) : null;
  };

  const out: AdDiagnosis[] = [];

  // 1) Anúncios COM atividade no período (vêm da view, com lead real e CPL real).
  for (const a of view.ads) {
    const m = adMeta.get(a.adId);
    const s = m ? adsetMeta.get(m.adsetId) : null;
    const tr = trend(a.adId);
    const daysLive = daysLiveOf(m?.startedAt ?? null, a.adId);
    const adWa = m?.whatsappNumber ?? null;
    const learningStage = s?.learningStage ?? null;
    const dailyBudget = s?.dailyBudget ?? null;

    const realLeads = a.leads;
    const modeledLeads = a.metaLeads;
    const realCpl = a.cpl;

    // Amostra suficiente p/ julgar desempenho.
    const spendSampleOk = baselineCpl ? a.spend >= SAMPLE_SPEND_MULT * baselineCpl : a.spend >= SAMPLE_SPEND_ABS;
    const sufficient = (daysLive == null || daysLive >= MIN_DAYS_TO_JUDGE) && (spendSampleOk || a.impressions >= SAMPLE_IMPRESSIONS);
    const confidence: AdDiagnosis["confidence"] =
      sufficient && (daysLive == null || daysLive >= 5) && (baselineCpl ? a.spend >= 3 * baselineCpl : a.spend >= 2 * SAMPLE_SPEND_ABS)
        ? "alta" : sufficient ? "media" : "baixa";

    // ── Sinais (observações secundárias, sempre avaliadas) ──
    const signals: AdSignal[] = [];
    if (isBelow(m?.qualityRanking ?? null)) signals.push({ severity: "warning", text: "Criativo com qualidade abaixo da média (Meta)." });
    if (isBelow(m?.conversionRanking ?? null)) signals.push({ severity: "warning", text: "Taxa de conversão abaixo da média (Meta) — oferta/fluxo de atendimento." });
    if (isBelow(m?.engagementRanking ?? null)) signals.push({ severity: "info", text: "Engajamento abaixo da média (Meta)." });
    if (modeledLeads >= MODELED_MIN && realLeads <= modeledLeads * MODELED_GAP_RATIO) {
      signals.push({ severity: "neutral", text: `A Meta reporta ${modeledLeads} conversa(s); chegaram ${realLeads} de verdade no WhatsApp.` });
    }
    if (tr.avgFreq != null && tr.avgFreq >= FREQ_SATURATION) signals.push({ severity: "info", text: `Frequência média ${tr.avgFreq.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} — público pode estar saturando.` });
    if (dailyBudget && a.spend > 0 && daysLive && daysLive > 0 && a.spend / Math.min(daysLive, 30) >= dailyBudget * 0.9) {
      signals.push({ severity: "info", text: `Gastando perto do teto do orçamento (${brl(dailyBudget)}/dia).` });
    }

    // ── Veredito primário (cascata por prioridade) ──
    let scenario = "estavel", severity: AdSeverity = "info", title = "", action = "";

    const ctrDecline = tr.declinePct != null && tr.declinePct >= CTR_DECLINE_PCT;

    if (m && (m.status === "DISAPPROVED" || m.status === "WITH_ISSUES")) {
      scenario = "reprovado"; severity = "critical";
      title = m.status === "DISAPPROVED" ? "Anúncio reprovado pela Meta" : "Anúncio com pendência na Meta";
      action = "Resolva a reprovação/pendência na Meta — assim o anúncio não entrega.";
    } else if (adWa && connectedNumber && onlyDigits(adWa) !== connectedNumber) {
      scenario = "destino_divergente"; severity = "critical";
      title = "Destino aponta para outro WhatsApp";
      action = `O anúncio leva para o número ${adWa}, diferente do conectado (${connectedNumber}). Corrija o destino — os leads não chegam aqui.`;
    } else if (m && m.status !== "ACTIVE") {
      // Anúncio parado (arquivado/pausado): não está rodando — não cabe
      // "aprendizado"/"sangria"/"escalar". Mostra o histórico, sem ação de mídia.
      const label = m.status === "ARCHIVED" ? "Arquivado" : "Pausado";
      scenario = "pausado"; severity = "neutral"; title = label;
      action = realLeads > 0
        ? `${label} — gerou ${realLeads} lead(s) real(is) enquanto rodou (${brl(a.spend)}).`
        : `${label} — gastou ${brl(a.spend)} sem lead real registrado. Não está mais rodando.`;
    } else if (m?.status === "ACTIVE" && a.spend === 0 && daysLive != null && daysLive > 2) {
      scenario = "sem_entrega"; severity = "critical";
      title = "Ativo, mas sem entrega";
      action = "Não gastou nada no período mesmo ativo — verifique orçamento, segmentação e cobrança.";
    } else if (!sufficient) {
      scenario = "aprendizado"; severity = "info";
      title = "Em aprendizado";
      action = `Amostra ainda pequena (${daysLive != null ? `${daysLive}d no ar, ` : ""}${brl(a.spend)} gasto). Aguarde antes de decidir — dentro do esperado.`;
    } else if (realLeads === 0 && (baselineCpl ? a.spend >= SANGRIA_SPEND_MULT * baselineCpl : a.spend >= SANGRIA_SPEND_MULT * SAMPLE_SPEND_ABS)) {
      scenario = "sangria"; severity = "critical";
      title = "Gastando sem gerar lead real";
      action = `${brl(a.spend)}${daysLive != null ? ` em ${daysLive} ${daysLive === 1 ? "dia" : "dias"}` : " no período"} sem nenhum lead real no WhatsApp. Pause ou refaça criativo/oferta.`;
    } else if (realLeads >= WIN_MIN_LEADS && realCpl != null && baselineCpl != null && realCpl <= baselineCpl) {
      scenario = "vencedor"; severity = "positive";
      title = "Melhor eficiência — candidato a escalar";
      action = "CPL real abaixo da referência. Escale +20%/dia para não reiniciar a fase de aprendizado.";
    } else if (realLeads > 0 && realCpl != null && baselineCpl != null && realCpl > baselineCpl * CPL_HIGH_MULT) {
      scenario = "cpl_alto"; severity = "warning";
      title = "CPL acima da referência";
      action = `CPL real ${brl(realCpl)} vs alvo ${brl(baselineCpl)}. Teste novo criativo/segmentação antes de escalar.`;
    } else if (ctrDecline) {
      scenario = "saturacao"; severity = "warning";
      title = "Sinais de fadiga (CTR caindo)";
      action = "CTR em queda com gasto contínuo — renove o criativo para recuperar desempenho.";
    } else if (learningStage === "LEARNING_LIMITED") {
      scenario = "learning_limited"; severity = "warning";
      title = "Conjunto em aprendizado limitado";
      action = "Público/orçamento pequenos demais — consolide conjuntos ou aumente a verba para sair do limitado.";
    } else if (modeledLeads >= MODELED_MIN && realLeads <= modeledLeads * MODELED_GAP_RATIO) {
      scenario = "modelado"; severity = "neutral";
      title = "Meta superestima as conversas";
      action = "As conversas reportadas não viraram lead real proporcional — valide número de destino e qualidade.";
    } else {
      scenario = "estavel"; severity = realLeads > 0 ? "positive" : "info";
      title = realLeads > 0 ? "Dentro da referência" : "Estável, sem leads ainda";
      action = realLeads > 0 ? "Eficiência dentro do esperado — mantenha e monitore." : "Sem leads reais, mas ainda dentro da margem de amostra. Monitore.";
    }

    // ── Evidência (números concretos que sustentam o veredito) ──
    const evidence: string[] = [];
    if (daysLive != null) evidence.push(`${daysLive} ${daysLive === 1 ? "dia" : "dias"} no ar`);
    evidence.push(`${brl(a.spend)} gasto`);
    evidence.push(`${realLeads} lead${realLeads === 1 ? "" : "s"} real${realLeads === 1 ? "" : "is"}${modeledLeads ? ` (Meta: ${modeledLeads})` : ""}`);
    if (realCpl != null) evidence.push(`CPL real ${brl(realCpl)}${baselineCpl != null ? ` · alvo ${brl(baselineCpl)}` : ""}`);
    else if (baselineCpl != null) evidence.push(`alvo ${brl(baselineCpl)}`);
    evidence.push(`CTR ${pct(a.ctr)}${tr.ctrStart != null && tr.ctrEnd != null ? ` (${pct(tr.ctrStart)}→${pct(tr.ctrEnd)})` : ""}`);
    if (learningStage) evidence.push(`Aprendizado: ${learningStage}`);

    out.push({
      adId: a.adId, name: a.name, campaignName: a.campaignName, status: a.status,
      severity, scenario, title, action, confidence, evidence, signals,
      metrics: {
        daysLive, spend: a.spend, realLeads, modeledLeads, realCpl, baselineCpl,
        ctr: a.ctr, ctrStart: tr.ctrStart, ctrEnd: tr.ctrEnd, avgFrequency: tr.avgFreq,
        dailyBudget, whatsappNumber: adWa, connectedNumber, learningStage,
        qualityRanking: m?.qualityRanking ?? null, engagementRanking: m?.engagementRanking ?? null, conversionRanking: m?.conversionRanking ?? null,
      },
    });
  }

  // 2) Anúncios ATIVOS sem atividade no período (não aparecem na view) → sem entrega.
  const inView = new Set(view.ads.map((a) => a.adId));
  for (const m of metaAds) {
    if (m.status !== "ACTIVE" || inView.has(m.adId)) continue;
    const daysLive = daysLiveOf(m.startedAt, m.adId);
    if (daysLive == null || daysLive <= 2) continue; // recém-criado: ainda pode não ter entregue
    const camp = view.campaigns.find((c) => c.campaignId === m.campaignId);
    out.push({
      adId: m.adId, name: m.name, campaignName: camp?.name ?? "—", status: m.status,
      severity: "critical", scenario: "sem_entrega", title: "Ativo, mas sem entrega",
      action: "Ativo há mais de 2 dias e sem nenhuma entrega no período — verifique orçamento, segmentação e cobrança.",
      confidence: "media", evidence: [`${daysLive} dias no ar`, "R$ 0,00 gasto no período"], signals: [],
      metrics: {
        daysLive, spend: 0, realLeads: 0, modeledLeads: 0, realCpl: null, baselineCpl,
        ctr: 0, ctrStart: null, ctrEnd: null, avgFrequency: null, dailyBudget: adsetMeta.get(m.adsetId)?.dailyBudget ?? null,
        whatsappNumber: m.whatsappNumber, connectedNumber, learningStage: adsetMeta.get(m.adsetId)?.learningStage ?? null,
        qualityRanking: m.qualityRanking, engagementRanking: m.engagementRanking, conversionRanking: m.conversionRanking,
      },
    });
  }

  out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.metrics.spend - a.metrics.spend);

  const counts: Record<AdSeverity, number> = { critical: 0, warning: 0, positive: 0, info: 0, neutral: 0 };
  for (const d of out) counts[d.severity]++;

  return {
    connected: true,
    hasData: out.length > 0,
    baselineCpl,
    generatedAt: new Date().toISOString(),
    ads: out,
    counts,
  };
}
