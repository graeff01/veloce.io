import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/lib/pdf-fonts";
import type { ClientReportData, ScorecardItem } from "@/lib/client-report";

const num = (v: number) => v.toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  return `${Math.floor(h / 24)} dia${Math.floor(h / 24) > 1 ? "s" : ""}`;
}
function growthLabel(g: number | null): { txt: string; color: string } | null {
  if (g == null) return null;
  if (g > 0) return { txt: `+${g}% vs mês anterior`, color: GREEN };
  if (g < 0) return { txt: `${g}% vs mês anterior`, color: RED };
  return { txt: "estável vs mês anterior", color: MUTED };
}

const INK = "#0F172A", INK2 = "#1E293B", MUTED = "#64748B", FAINT = "#94A3B8", LINE = "#E2E8F0";
const BG = "#FFFFFF", SOFT = "#F8FAFC", RED = "#B42318", ACCENT = "#4F46E5", GREEN = "#16A34A", AMBER = "#B45309";
const GREENSOFT = "#ECFDF5", REDSOFT = "#FEF2F2";

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 56, paddingHorizontal: 54, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },
  // ── Capa minimalista ──
  cover: { flex: 1, justifyContent: "center", paddingHorizontal: 4 },
  coverKicker: { fontSize: 9, color: MUTED, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 3, marginBottom: 34 },
  coverClient: { fontSize: 40, fontFamily: "Inter Tight", fontWeight: 800, color: INK, letterSpacing: -0.8, lineHeight: 1.04 },
  coverPeriod: { fontSize: 13, color: MUTED, marginTop: 18 },
  coverRule: { height: 2.5, backgroundColor: ACCENT, marginTop: 28, marginBottom: 28, width: 40, borderRadius: 2 },
  coverBy: { fontSize: 10, color: FAINT },
  coverByStrong: { fontSize: 10, color: INK2, fontFamily: "Helvetica-Bold" },
  coverBrandBottom: { position: "absolute", bottom: 54, left: 54, fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  // ── Conteúdo ──
  runHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  runBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  runMeta: { fontSize: 8, color: FAINT },
  kicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 5 },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 18, letterSpacing: -0.3, lineHeight: 1.15 },
  // Barra de saúde (slim)
  healthRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: LINE },
  healthScore: { fontSize: 30, fontFamily: "Helvetica-Bold", letterSpacing: -1 },
  healthScoreMax: { fontSize: 11, color: FAINT, fontFamily: "Helvetica" },
  healthMeta: { flex: 1 },
  healthLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  healthSub: { fontSize: 9, color: MUTED, marginTop: 2, lineHeight: 1.4 },
  healthTrack: { height: 6, backgroundColor: SOFT, borderRadius: 3, marginTop: 7, overflow: "hidden" },
  // Placar (duas colunas em painéis de mesma altura)
  cols: { flexDirection: "row", gap: 14, marginBottom: 22, alignItems: "stretch" },
  col: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 15, paddingHorizontal: 15 },
  colWin: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  colConcern: { backgroundColor: REDSOFT, borderColor: "#FECACA" },
  colHead: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  colDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  colTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  item: { flexDirection: "row", alignItems: "baseline", marginBottom: 13 },
  itemMetric: { width: 82, fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: -0.4, paddingRight: 8 },
  itemLabel: { flex: 1, fontSize: 9.5, color: INK2, lineHeight: 1.4 },
  // Resultado (KPIs)
  secLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 9 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  kpiCell: { width: "31.5%", paddingVertical: 10, paddingHorizontal: 11, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 7.5, color: MUTED, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 17, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5 },
  kpiGrowth: { fontSize: 7.5, marginTop: 3, fontFamily: "Helvetica-Bold" },
  // Gargalo
  lead: { fontSize: 11.5, color: INK2, lineHeight: 1.55, marginBottom: 16 },
  costBox: { flexDirection: "row", backgroundColor: REDSOFT, borderWidth: 1, borderColor: "#FCA5A5", borderLeftWidth: 4, borderLeftColor: RED, borderRadius: 8, padding: 14, marginBottom: 16, gap: 16 },
  costCell: { flex: 1 },
  costDivider: { width: 1, backgroundColor: "#FCA5A5" },
  costLabel: { fontSize: 7.5, color: RED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontFamily: "Helvetica-Bold" },
  costBig: { fontSize: 24, fontFamily: "Helvetica-Bold", color: RED, letterSpacing: -0.8 },
  costNote: { fontSize: 8, color: "#7F1D1D", marginTop: 4 },
  block: { marginBottom: 12 },
  blockLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  blockText: { fontSize: 10.5, color: INK2, lineHeight: 1.5 },
  solutionBox: { backgroundColor: GREENSOFT, borderWidth: 1, borderColor: "#A7F3D0", borderLeftWidth: 4, borderLeftColor: GREEN, borderRadius: 8, padding: 13, marginBottom: 12 },
  solutionLabel: { fontSize: 8, color: GREEN, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  solutionText: { fontSize: 10.5, color: "#065F46", lineHeight: 1.5 },
  // Evidência compacta
  evidence: { marginTop: 6, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12 },
  bar: { flexDirection: "row", height: 13, borderRadius: 4, overflow: "hidden", marginBottom: 7, backgroundColor: SOFT },
  evLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  evItem: { flexDirection: "row", alignItems: "center" },
  evDot: { width: 6, height: 6, borderRadius: 2, marginRight: 4 },
  evTxt: { fontSize: 8, color: MUTED },
  note: { fontSize: 8.5, color: FAINT, lineHeight: 1.5, marginTop: 14 },
});

function Item({ it, color, last }: { it: ScorecardItem; color: string; last?: boolean }) {
  return (
    <View style={[s.item, last ? { marginBottom: 0 } : {}]}>
      <Text style={[s.itemMetric, { color }]}>{it.metric}</Text>
      <Text style={s.itemLabel}>{it.label}</Text>
    </View>
  );
}
function Kpi({ label, value, growth }: { label: string; value: string; growth?: number | null }) {
  const g = growth !== undefined ? growthLabel(growth ?? null) : null;
  return (
    <View style={s.kpiCell}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {g ? <Text style={[s.kpiGrowth, { color: g.color }]}>{g.txt}</Text> : null}
    </View>
  );
}

function ClientReportDoc({ data: d }: { data: ClientReportData }) {
  const b = d.bottleneck;
  const r = d.results;
  const sc = d.scorecard;
  const bk = d.attendance.buckets;
  const segs = [
    { v: bk.upTo5min, c: GREEN, label: "até 5 min" },
    { v: bk.upTo30min, c: "#65A30D", label: "até 30 min" },
    { v: bk.upTo1h, c: AMBER, label: "até 1h" },
    { v: bk.over1h, c: "#F97316", label: "mais de 1h" },
    { v: bk.unanswered, c: RED, label: "sem resposta" },
  ];
  return (
    <Document title={`Relatório de desempenho — ${d.clientName}`} author="Veloce.io">
      {/* CAPA minimalista */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório de desempenho</Text>
          <Text style={s.coverClient}>{d.clientName}</Text>
          <Text style={s.coverPeriod}>{d.periodLabel}</Text>
          <View style={s.coverRule} />
          <Text style={s.coverBy}>Preparado por <Text style={s.coverByStrong}>Veloce.io</Text></Text>
        </View>
        <Text style={s.coverBrandBottom}>veloce.io</Text>
      </Page>

      {/* PLACAR — acertos × atenção + resultado */}
      <Page size="A4" style={s.page}>
        <View style={s.runHead}><Text style={s.runBrand}>{d.clientName}</Text><Text style={s.runMeta}>Relatório de desempenho · {d.periodLabel}</Text></View>
        <Text style={s.kicker}>Balanço do mês · leads de anúncio (mídia paga)</Text>

        {d.hasData && (
          <View style={s.healthRow}>
            <Text style={[s.healthScore, { color: d.health.color }]}>{d.health.score}<Text style={s.healthScoreMax}> /100</Text></Text>
            <View style={s.healthMeta}>
              <Text style={s.healthLabel}>Saúde do atendimento: {d.health.label}</Text>
              <Text style={s.healthSub}>Quantos leads são respondidos e quão rápido — quanto mais alto, menos oportunidade perdida.</Text>
              <View style={s.healthTrack}><View style={{ height: 6, width: `${d.health.score}%`, backgroundColor: d.health.color }} /></View>
            </View>
          </View>
        )}

        {d.hasData ? (
          <View style={s.cols}>
            <View style={[s.col, s.colWin]}>
              <View style={s.colHead}><View style={[s.colDot, { backgroundColor: GREEN }]} /><Text style={[s.colTitle, { color: GREEN }]}>O que foi bem</Text></View>
              {sc.wins.map((it, i) => <Item key={i} it={it} color={GREEN} last={i === sc.wins.length - 1} />)}
            </View>
            <View style={[s.col, s.colConcern]}>
              <View style={s.colHead}><View style={[s.colDot, { backgroundColor: RED }]} /><Text style={[s.colTitle, { color: RED }]}>Pontos de atenção</Text></View>
              {sc.concerns.map((it, i) => <Item key={i} it={it} color={RED} last={i === sc.concerns.length - 1} />)}
            </View>
          </View>
        ) : (
          <Text style={s.lead}>Não há leads registrados no WhatsApp neste período para montar o balanço.</Text>
        )}

        <Text style={s.secLabel}>O resultado no mês</Text>
        <View style={s.kpiGrid}>
          <Kpi label="Leads de anúncio" value={r.leads.value != null ? num(r.leads.value) : "—"} growth={r.leads.growthPct} />
          <Kpi label="Conversões" value={r.conversoes.value != null ? num(r.conversoes.value) : "—"} growth={r.conversoes.growthPct} />
          <Kpi label="Atendimento" value={r.taxaAtendimentoPct != null ? `${r.taxaAtendimentoPct}%` : "—"} />
          <Kpi label="Resposta (mediana)" value={fmtDur(r.tempoMedianoSec)} />
          <Kpi label="Investimento em mídia" value={r.investimento != null ? brl(r.investimento) : "—"} />
          <Kpi label="Custo por lead real" value={r.cplReal != null ? brl(r.cplReal) : "—"} />
        </View>
      </Page>

      {/* GARGALO + AÇÃO */}
      {b && (
        <Page size="A4" style={s.page}>
          <View style={s.runHead}><Text style={s.runBrand}>{d.clientName}</Text><Text style={s.runMeta}>Relatório de desempenho · {d.periodLabel}</Text></View>
          <Text style={s.kicker}>O ponto mais importante</Text>
          <Text style={s.title}>{b.title}</Text>
          <Text style={s.lead}>{b.headline}</Text>

          <View style={s.costBox}>
            <View style={s.costCell}>
              <Text style={s.costLabel}>{b.metricLabel}</Text>
              <Text style={s.costBig}>{b.metricValue}</Text>
            </View>
            {b.costValue && <View style={s.costDivider} />}
            {b.costValue && (
              <View style={s.costCell}>
                <Text style={s.costLabel}>Mídia desperdiçada</Text>
                <Text style={s.costBig}>{b.costValue}</Text>
                {b.costNote && <Text style={s.costNote}>{b.costNote}</Text>}
              </View>
            )}
          </View>

          <View style={s.block}>
            <Text style={s.blockLabel}>Por que acontece</Text>
            <Text style={s.blockText}>{b.why}</Text>
          </View>
          <View style={s.solutionBox}>
            <Text style={s.solutionLabel}>A solução</Text>
            <Text style={s.solutionText}>{b.solution}</Text>
          </View>
          <View style={s.block}>
            <Text style={s.blockLabel}>O que muda se agir</Text>
            <Text style={s.blockText}>{b.expected}</Text>
          </View>

          {/* Evidência compacta */}
          <View style={s.evidence}>
            <Text style={[s.blockLabel, { marginBottom: 7 }]}>Velocidade de resposta no período</Text>
            <View style={s.bar}>
              {segs.map((g, i) => g.v > 0 ? <View key={i} style={{ flexGrow: g.v, backgroundColor: g.c }} /> : null)}
            </View>
            <View style={s.evLegend}>
              {segs.map((g, i) => (
                <View key={i} style={s.evItem}><View style={[s.evDot, { backgroundColor: g.c }]} /><Text style={s.evTxt}>{num(g.v)} {g.label}</Text></View>
              ))}
            </View>
            {d.offHours.pct != null && (
              <Text style={s.note}>{d.offHours.pct}% dos leads chegaram fora do horário comercial{d.offHours.peakHour != null ? `, com pico às ${String(d.offHours.peakHour).padStart(2, "0")}h` : ""}. Números do sistema real — nada estimado. Gerado em {d.generatedAt}.</Text>
            )}
          </View>
        </Page>
      )}
    </Document>
  );
}

export function buildClientReport(data: ClientReportData) {
  return <ClientReportDoc data={data} />;
}
