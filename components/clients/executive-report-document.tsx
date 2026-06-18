import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ExecutiveReportData, ExecKpi } from "@/lib/executive-report";

// ── Paleta corporativa (clara, monocromática, sem roxo) ──────────────────────
const INK = "#0F172A";       // quase-preto
const INK2 = "#1E293B";
const MUTED = "#64748B";      // cinza texto
const FAINT = "#94A3B8";
const LINE = "#E2E8F0";       // linhas finas
const BG = "#FFFFFF";
const SOFT = "#F8FAFC";       // fundo sutil de bloco
const POS = "#067647";        // verde discreto
const NEG = "#B42318";        // vermelho discreto
const BAR = "#0F172A";        // barras (monocromático)
const BARBG = "#EEF2F6";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ── Formatação ───────────────────────────────────────────────────────────────
function fmtDur(sec: number | null): string {
  if (sec == null) return "dado indisponível";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  return `${Math.floor(h / 24)} dias`;
}
function fmtNum(v: number | null): string {
  return v == null ? "dado indisponível" : v.toLocaleString("pt-BR");
}
function fmtPct(v: number | null): string {
  return v == null ? "dado indisponível" : `${Math.round(v)}%`;
}
function growthText(g: number | null): string {
  if (g == null) return "—";
  const r = Math.round(g);
  return `${r > 0 ? "+" : ""}${r}%`;
}
function growthColor(g: number | null, lowerIsBetter = false): string {
  if (g == null || g === 0) return MUTED;
  const good = lowerIsBetter ? g < 0 : g > 0;
  return good ? POS : NEG;
}

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },

  // Cabeçalho corrente
  runningHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  runningBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 0.3 },
  runningMeta: { fontSize: 8, color: FAINT },

  // Capa
  cover: { flex: 1, justifyContent: "center", paddingHorizontal: 56 },
  coverKicker: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 2, marginBottom: 22 },
  coverClient: { fontSize: 34, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5, lineHeight: 1.1 },
  coverTitle: { fontSize: 13, color: INK2, marginTop: 26, fontFamily: "Helvetica-Bold" },
  coverPeriod: { fontSize: 13, color: MUTED, marginTop: 4 },
  coverRule: { height: 1, backgroundColor: LINE, marginTop: 30, marginBottom: 18, width: 120 },
  coverFoot: { fontSize: 9, color: FAINT },
  coverBrandBottom: { position: "absolute", bottom: 54, left: 56, fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },

  // Seções
  sectionKicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  sectionTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3, marginBottom: 20 },

  // Texto executivo
  paragraph: { fontSize: 11, color: INK2, lineHeight: 1.6, marginBottom: 14 },
  listBlock: { marginTop: 6, marginBottom: 8 },
  listLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  listItem: { flexDirection: "row", marginBottom: 6, paddingRight: 10 },
  listDash: { fontSize: 10, color: FAINT, width: 14 },
  listText: { fontSize: 10, color: INK2, lineHeight: 1.45, flex: 1 },

  // KPI grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 0, marginTop: 4 },
  kpiCell: { width: "33.33%", paddingVertical: 16, paddingRight: 16, borderBottomWidth: 1, borderBottomColor: LINE },
  kpiLabel: { fontSize: 8.5, color: MUTED, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 24, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5 },
  kpiCompare: { fontSize: 8.5, marginTop: 6 },

  // Métricas em lista (atendimento)
  metricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: LINE },
  metricLabel: { fontSize: 10, color: MUTED },
  metricValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },

  // Barras
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  barLabel: { fontSize: 8.5, color: MUTED, width: 76 },
  barTrack: { flex: 1, height: 9, backgroundColor: BARBG, borderRadius: 2, overflow: "hidden" },
  barFill: { height: 9, backgroundColor: BAR, borderRadius: 2 },
  barValue: { fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold", width: 40, textAlign: "right" },

  // Funil
  funnelStep: { marginBottom: 12 },
  funnelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 },
  funnelName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK },
  funnelMeta: { fontSize: 9, color: MUTED },
  funnelTrack: { height: 26, backgroundColor: BARBG, borderRadius: 3, overflow: "hidden" },
  funnelFill: { height: 26, backgroundColor: BAR, borderRadius: 3, justifyContent: "center", paddingLeft: 10 },
  funnelFillText: { fontSize: 10, color: "#FFFFFF", fontFamily: "Helvetica-Bold" },

  // Tabela evolução
  evoHead: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1.2, borderBottomColor: INK },
  evoRow: { flexDirection: "row", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: "center" },
  evoTh: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  evoMetric: { width: "34%", fontSize: 10, color: INK, fontFamily: "Helvetica-Bold" },
  evoCol: { width: "22%", fontSize: 10, color: INK2, textAlign: "right" },
  evoColGrow: { width: "22%", fontSize: 10, textAlign: "right", fontFamily: "Helvetica-Bold" },

  note: { fontSize: 8, color: FAINT, marginTop: 18, lineHeight: 1.4 },
  emptyBig: { fontSize: 11, color: MUTED, marginTop: 30, lineHeight: 1.6 },

  footer: { position: "absolute", bottom: 30, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: FAINT },
});

function RunningHead({ data }: { data: ExecutiveReportData }) {
  return (
    <View style={s.runningHead} fixed>
      <Text style={s.runningBrand}>{data.clientName}</Text>
      <Text style={s.runningMeta}>Relatório Executivo · {data.periodLabel}</Text>
    </View>
  );
}

function Footer({ data }: { data: ExecutiveReportData }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Veloce.io</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      <Text style={s.footerText}>Gerado em {data.generatedAt}</Text>
    </View>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <View>
      <Text style={s.sectionKicker}>{kicker}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function KpiCell({ label, value, k, lowerIsBetter, prevLabel }: { label: string; value: string; k: ExecKpi; lowerIsBetter?: boolean; prevLabel: string }) {
  return (
    <View style={s.kpiCell}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={[s.kpiCompare, { color: growthColor(k.growthPct, lowerIsBetter) }]}>
        {k.growthPct == null ? "sem base anterior" : `${growthText(k.growthPct)} vs ${prevLabel}`}
      </Text>
    </View>
  );
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const w = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel}>{label}</Text>
      <View style={s.barTrack}><View style={[s.barFill, { width: `${w}%` }]} /></View>
      <Text style={s.barValue}>{count}</Text>
    </View>
  );
}

function FunnelStep({ name, count, base, prevCount }: { name: string; count: number; base: number; prevCount: number | null }) {
  const wOfBase = base > 0 ? Math.max(3, (count / base) * 100) : 0;
  const advance = prevCount != null && prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
  return (
    <View style={s.funnelStep}>
      <View style={s.funnelHead}>
        <Text style={s.funnelName}>{name}</Text>
        <Text style={s.funnelMeta}>
          {count.toLocaleString("pt-BR")}
          {base > 0 ? `  ·  ${Math.round((count / base) * 100)}% do total` : ""}
          {advance != null ? `  ·  ${advance}% da etapa anterior` : ""}
        </Text>
      </View>
      <View style={s.funnelTrack}>
        <View style={[s.funnelFill, { width: `${wOfBase}%` }]}>
          {wOfBase > 18 ? <Text style={s.funnelFillText}>{count.toLocaleString("pt-BR")}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function ExecutiveReportDocument({ data }: { data: ExecutiveReportData }) {
  const prevShort = data.prevPeriodLabel.split(" de ")[0]; // "Maio"
  const maxHour = Math.max(1, ...data.behavior.byHour.map((h) => h.count));
  const maxWeekday = Math.max(1, ...data.behavior.byWeekday.map((w) => w.count));

  // Agrupa horas em faixas legíveis (madrugada/manhã/tarde/noite) para leitura executiva.
  const hourBands = [
    { label: "00–06h", from: 0, to: 6 },
    { label: "06–09h", from: 6, to: 9 },
    { label: "09–12h", from: 9, to: 12 },
    { label: "12–15h", from: 12, to: 15 },
    { label: "15–18h", from: 15, to: 18 },
    { label: "18–21h", from: 18, to: 21 },
    { label: "21–24h", from: 21, to: 24 },
  ].map((b) => ({ label: b.label, count: data.behavior.byHour.slice(b.from, b.to).reduce((a, h) => a + h.count, 0) }));
  const maxBand = Math.max(1, ...hourBands.map((b) => b.count));

  return (
    <Document title={`Relatório Executivo — ${data.clientName}`} author="Veloce.io">
      {/* ── CAPA ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório Executivo</Text>
          <Text style={s.coverClient}>{data.clientName}</Text>
          <Text style={s.coverTitle}>Relatório Executivo Mensal</Text>
          <Text style={s.coverPeriod}>{data.periodLabel}</Text>
          <View style={s.coverRule} />
          <Text style={s.coverFoot}>Resumo gerado pela Veloce.io</Text>
        </View>
        <Text style={s.coverBrandBottom}>veloce.io</Text>
      </Page>

      {/* ── P1 · RESUMO EXECUTIVO ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 1" title="Resumo executivo" />
        {data.hasData ? (
          <>
            <Text style={s.paragraph}>
              Durante {data.periodLabel}, a operação gerou {fmtNum(data.summary.leads)} oportunidade(s) através dos canais monitorados.
              {data.summary.avgResponseMin != null ? ` O tempo médio de resposta foi de ${data.summary.avgResponseMin} minuto(s).` : ""}
              {data.summary.attendanceRatePct != null ? ` A taxa de atendimento ficou em ${data.summary.attendanceRatePct}%.` : ""}
              {data.summary.leadsGrowthPct != null
                ? ` A operação apresentou ${data.summary.leadsGrowthPct >= 0 ? "crescimento" : "retração"} de ${Math.abs(data.summary.leadsGrowthPct)}% em relação ao período anterior.`
                : ""}
            </Text>

            {data.summary.highlights.length > 0 && (
              <View style={s.listBlock}>
                <Text style={s.listLabel}>Principais destaques</Text>
                {data.summary.highlights.map((h, i) => (
                  <View key={i} style={s.listItem}><Text style={s.listDash}>—</Text><Text style={s.listText}>{h}</Text></View>
                ))}
              </View>
            )}

            {data.summary.attentionPoints.length > 0 && (
              <View style={s.listBlock}>
                <Text style={s.listLabel}>Principais pontos de atenção</Text>
                {data.summary.attentionPoints.map((p, i) => (
                  <View key={i} style={s.listItem}><Text style={s.listDash}>—</Text><Text style={s.listText}>{p}</Text></View>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={s.emptyBig}>Não há dados de operação registrados para {data.periodLabel}. Dado indisponível.</Text>
        )}
        <Footer data={data} />
      </Page>

      {/* ── P2 · VISÃO GERAL ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 2" title="Visão geral" />
        <View style={s.kpiGrid}>
          <KpiCell label="Oportunidades recebidas" value={fmtNum(data.kpis.leads.value)} k={data.kpis.leads} prevLabel={prevShort} />
          <KpiCell label="Negociações iniciadas" value={fmtNum(data.kpis.negociacoes.value)} k={data.kpis.negociacoes} prevLabel={prevShort} />
          <KpiCell label="Conversões" value={fmtNum(data.kpis.conversoes.value)} k={data.kpis.conversoes} prevLabel={prevShort} />
          <KpiCell label="Tempo médio de resposta" value={fmtDur(data.kpis.avgResponseSec.value)} k={data.kpis.avgResponseSec} lowerIsBetter prevLabel={prevShort} />
          <KpiCell label="Taxa de atendimento" value={fmtPct(data.kpis.attendanceRate.value)} k={data.kpis.attendanceRate} prevLabel={prevShort} />
          <KpiCell label="Tempo até 1º contato" value={fmtDur(data.kpis.firstContactSec.value)} k={data.kpis.firstContactSec} lowerIsBetter prevLabel={prevShort} />
        </View>
        <Text style={s.note}>Comparativo calculado sobre {data.prevPeriodLabel}. Quando não há base no período anterior, exibimos “sem base anterior”.</Text>
        <Footer data={data} />
      </Page>

      {/* ── P3 · PERFORMANCE DE ATENDIMENTO ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 3" title="Performance de atendimento" />
        <View style={s.metricRow}><Text style={s.metricLabel}>Tempo médio de resposta</Text><Text style={s.metricValue}>{fmtDur(data.attendance.avgResponseSec)}</Text></View>
        <View style={s.metricRow}><Text style={s.metricLabel}>Resposta mais rápida</Text><Text style={s.metricValue}>{fmtDur(data.attendance.minResponseSec)}</Text></View>
        <View style={s.metricRow}><Text style={s.metricLabel}>Resposta mais lenta</Text><Text style={s.metricValue}>{fmtDur(data.attendance.maxResponseSec)}</Text></View>
        <View style={s.metricRow}><Text style={s.metricLabel}>Tempo médio até primeiro contato</Text><Text style={s.metricValue}>{fmtDur(data.attendance.avgResponseSec)}</Text></View>
        <View style={s.metricRow}><Text style={s.metricLabel}>Taxa de atendimento</Text><Text style={s.metricValue}>{fmtPct(data.attendance.attendanceRatePct)}</Text></View>
        <View style={s.metricRow}><Text style={s.metricLabel}>Oportunidades sem resposta</Text><Text style={[s.metricValue, data.attendance.unanswered > 0 ? { color: NEG } : {}]}>{fmtNum(data.attendance.unanswered)}</Text></View>

        <Text style={[s.listLabel, { marginTop: 28 }]}>Distribuição dos tempos de resposta</Text>
        {data.attendance.total > 0 ? (
          <View style={{ marginTop: 4 }}>
            <Bar label="Até 5 min" count={data.attendance.buckets.upTo5min} max={data.attendance.total} />
            <Bar label="5–30 min" count={data.attendance.buckets.upTo30min} max={data.attendance.total} />
            <Bar label="30–60 min" count={data.attendance.buckets.upTo1h} max={data.attendance.total} />
            <Bar label="Acima de 1h" count={data.attendance.buckets.over1h} max={data.attendance.total} />
            <Bar label="Sem resposta" count={data.attendance.buckets.unanswered} max={data.attendance.total} />
          </View>
        ) : <Text style={s.emptyBig}>Dado indisponível.</Text>}
        <Footer data={data} />
      </Page>

      {/* ── P4 · COMPORTAMENTO DOS LEADS ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 4" title="Comportamento das oportunidades" />
        {data.behavior.hasData ? (
          <>
            <Text style={s.listLabel}>Distribuição por horário de entrada</Text>
            <View style={{ marginTop: 4, marginBottom: 22 }}>
              {hourBands.map((b) => <Bar key={b.label} label={b.label} count={b.count} max={maxBand} />)}
            </View>

            <Text style={s.listLabel}>Distribuição por dia da semana</Text>
            <View style={{ marginTop: 4, marginBottom: 22 }}>
              {data.behavior.byWeekday.map((w) => <Bar key={w.weekday} label={WEEKDAYS[w.weekday]} count={w.count} max={maxWeekday} />)}
            </View>

            <View style={s.metricRow}><Text style={s.metricLabel}>Horário de pico</Text><Text style={s.metricValue}>{data.behavior.peakHour != null ? `${String(data.behavior.peakHour).padStart(2, "0")}h` : "dado indisponível"}</Text></View>
            <View style={s.metricRow}><Text style={s.metricLabel}>Dia de maior demanda</Text><Text style={s.metricValue}>{data.behavior.peakWeekday != null ? WEEKDAYS[data.behavior.peakWeekday] : "dado indisponível"}</Text></View>
          </>
        ) : <Text style={s.emptyBig}>Não há registros de horário de entrada no período. Dado indisponível.</Text>}
        <Footer data={data} />
      </Page>

      {/* ── P5 · JORNADA DAS OPORTUNIDADES ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 5" title="Jornada das oportunidades" />
        {data.funnel.recebido > 0 ? (
          <View style={{ marginTop: 4 }}>
            <FunnelStep name="Recebidos" count={data.funnel.recebido} base={data.funnel.recebido} prevCount={null} />
            <FunnelStep name="Atendidos" count={data.funnel.atendido} base={data.funnel.recebido} prevCount={data.funnel.recebido} />
            <FunnelStep name="Qualificados" count={data.funnel.qualificado} base={data.funnel.recebido} prevCount={data.funnel.atendido} />
            <FunnelStep name="Em negociação" count={data.funnel.negociacao} base={data.funnel.recebido} prevCount={data.funnel.qualificado} />
            <FunnelStep name="Convertidos" count={data.funnel.convertido} base={data.funnel.recebido} prevCount={data.funnel.negociacao} />
          </View>
        ) : <Text style={s.emptyBig}>Dado indisponível.</Text>}
        <Text style={s.note}>O percentual “da etapa anterior” indica a taxa de avanço entre fases — quanto menor, maior o gargalo naquela passagem.</Text>
        <Footer data={data} />
      </Page>

      {/* ── P6 · ANÁLISE DE EVOLUÇÃO ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 6" title="Análise de evolução" />
        <View style={s.evoHead}>
          <Text style={[s.evoTh, s.evoMetric]}>Indicador</Text>
          <Text style={[s.evoTh, s.evoCol]}>{data.periodLabel.split(" de ")[0]}</Text>
          <Text style={[s.evoTh, s.evoCol]}>{prevShort}</Text>
          <Text style={[s.evoTh, s.evoColGrow]}>Variação</Text>
        </View>
        <EvoRow label="Oportunidades" k={data.kpis.leads} fmt={fmtNum} />
        <EvoRow label="Tempo de resposta" k={data.kpis.avgResponseSec} fmt={fmtDur} lowerIsBetter />
        <EvoRow label="Taxa de atendimento" k={data.kpis.attendanceRate} fmt={fmtPct} />
        <EvoRow label="Negociações" k={data.kpis.negociacoes} fmt={fmtNum} />
        <EvoRow label="Conversões" k={data.kpis.conversoes} fmt={fmtNum} />
        <Footer data={data} />
      </Page>

      {/* ── P7 · CONCLUSÕES ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 7" title="Conclusões e recomendações" />
        {data.conclusions.length > 0 ? (
          <View style={{ marginTop: 4 }}>
            {data.conclusions.map((c, i) => (
              <View key={i} style={s.listItem}><Text style={s.listDash}>—</Text><Text style={[s.listText, { fontSize: 11, lineHeight: 1.55, marginBottom: 4 }]}>{c}</Text></View>
            ))}
          </View>
        ) : <Text style={s.emptyBig}>Dado indisponível para gerar conclusões no período.</Text>}
        <Footer data={data} />
      </Page>
    </Document>
  );
}

function EvoRow({ label, k, fmt, lowerIsBetter }: { label: string; k: ExecKpi; fmt: (v: number | null) => string; lowerIsBetter?: boolean }) {
  return (
    <View style={s.evoRow}>
      <Text style={s.evoMetric}>{label}</Text>
      <Text style={s.evoCol}>{fmt(k.value)}</Text>
      <Text style={s.evoCol}>{fmt(k.prev)}</Text>
      <Text style={[s.evoColGrow, { color: growthColor(k.growthPct, lowerIsBetter) }]}>{growthText(k.growthPct)}</Text>
    </View>
  );
}

export function buildExecutiveReport(data: ExecutiveReportData) {
  return <ExecutiveReportDocument data={data} />;
}
