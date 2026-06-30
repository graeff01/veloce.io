import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/lib/pdf-fonts";
import type { ClientReportData } from "@/lib/client-report";

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
  if (g > 0) return { txt: `+${g}% vs mês anterior`, color: "#16A34A" };
  if (g < 0) return { txt: `${g}% vs mês anterior`, color: "#B42318" };
  return { txt: "estável vs mês anterior", color: "#64748B" };
}

const INK = "#0F172A", INK2 = "#1E293B", MUTED = "#64748B", FAINT = "#94A3B8", LINE = "#E2E8F0";
const BG = "#FFFFFF", SOFT = "#F8FAFC", RED = "#B42318", ACCENT = "#4F46E5", GREEN = "#16A34A";
const GREENSOFT = "#ECFDF5", REDSOFT = "#FEF2F2";

const s = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 56, paddingHorizontal: 50, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },
  // Capa
  cover: { flex: 1, justifyContent: "center", paddingHorizontal: 6 },
  coverKicker: { fontSize: 9, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 2, marginBottom: 22 },
  coverClient: { fontSize: 36, fontFamily: "Inter Tight", fontWeight: 800, color: INK, letterSpacing: -0.6, lineHeight: 1.05 },
  coverHeadline: { fontSize: 13, color: INK2, marginTop: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.5 },
  coverRule: { height: 3, backgroundColor: ACCENT, marginTop: 24, marginBottom: 24, width: 44, borderRadius: 2 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 },
  scoreBadge: { width: 78, height: 78, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  scoreNum: { fontSize: 30, fontFamily: "Helvetica-Bold", color: "#FFFFFF", letterSpacing: -1 },
  scoreMax: { fontSize: 9, color: "#FFFFFF", opacity: 0.85 },
  scoreMeta: { flex: 1 },
  scoreLabel: { fontSize: 14, fontFamily: "Helvetica-Bold", color: INK },
  scoreSub: { fontSize: 9.5, color: MUTED, marginTop: 3, lineHeight: 1.4 },
  metaRow: { flexDirection: "row", marginTop: 26, marginBottom: 9 },
  metaLabel: { width: 120, fontSize: 8.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 1 },
  metaValue: { fontSize: 11, color: INK, fontFamily: "Helvetica-Bold", flex: 1 },
  coverBrandBottom: { position: "absolute", bottom: 50, left: 50, fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  // Conteúdo
  runHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  runBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  runMeta: { fontSize: 8, color: FAINT },
  kicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 5 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 4, letterSpacing: -0.3, lineHeight: 1.15 },
  lead: { fontSize: 11.5, color: INK2, lineHeight: 1.55, marginBottom: 16 },
  // Bloco de custo (prejuízo)
  costBox: { flexDirection: "row", backgroundColor: REDSOFT, borderWidth: 1, borderColor: "#FCA5A5", borderLeftWidth: 4, borderLeftColor: RED, borderRadius: 8, padding: 14, marginBottom: 16, gap: 16 },
  costCell: { flex: 1 },
  costDivider: { width: 1, backgroundColor: "#FCA5A5" },
  costLabel: { fontSize: 7.5, color: RED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontFamily: "Helvetica-Bold" },
  costBig: { fontSize: 24, fontFamily: "Helvetica-Bold", color: RED, letterSpacing: -0.8 },
  costNote: { fontSize: 8, color: "#7F1D1D", marginTop: 4 },
  // Blocos rotulados (por que / solução / o que muda)
  block: { marginBottom: 12 },
  blockLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  blockText: { fontSize: 10.5, color: INK2, lineHeight: 1.5 },
  solutionBox: { backgroundColor: GREENSOFT, borderWidth: 1, borderColor: "#A7F3D0", borderLeftWidth: 4, borderLeftColor: GREEN, borderRadius: 8, padding: 13, marginBottom: 12 },
  solutionLabel: { fontSize: 8, color: GREEN, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  solutionText: { fontSize: 10.5, color: "#065F46", lineHeight: 1.5 },
  // Resultado (KPIs)
  secLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 8, marginTop: 4 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  kpiCell: { width: "31.5%", paddingVertical: 10, paddingHorizontal: 11, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 7.5, color: MUTED, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 17, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5 },
  kpiGrowth: { fontSize: 7.5, marginTop: 3, fontFamily: "Helvetica-Bold" },
  // Provas
  proofTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 10, letterSpacing: -0.2 },
  bar: { flexDirection: "row", height: 15, borderRadius: 5, overflow: "hidden", marginBottom: 8, backgroundColor: SOFT },
  legendRow: { flexDirection: "row", gap: 6, marginBottom: 18 },
  legCell: { flex: 1, alignItems: "center", paddingVertical: 7, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  legTop: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  dot: { width: 7, height: 7, borderRadius: 2, marginRight: 4 },
  legCount: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  legLabel: { fontSize: 7, color: MUTED, textAlign: "center" },
  funnelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  funnelName: { width: 110, fontSize: 9, color: INK2 },
  funnelTrack: { flex: 1, height: 14, backgroundColor: SOFT, borderRadius: 4, marginRight: 8, overflow: "hidden" },
  funnelFill: { height: 14, backgroundColor: ACCENT, borderRadius: 4 },
  funnelVal: { width: 34, fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, textAlign: "right" },
  note: { fontSize: 8.5, color: FAINT, lineHeight: 1.5, marginTop: 14, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 9 },
});

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={s.metaRow}><Text style={s.metaLabel}>{label}</Text><Text style={s.metaValue}>{value}</Text></View>;
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
  const fb = d.funnel;
  const fMax = Math.max(fb.recebido, 1);
  const buckets = [
    { v: d.attendance.buckets.upTo5min, c: GREEN, label: "Até 5 min" },
    { v: d.attendance.buckets.upTo30min, c: "#65A30D", label: "5 a 30 min" },
    { v: d.attendance.buckets.upTo1h, c: "#B45309", label: "30 a 60 min" },
    { v: d.attendance.buckets.over1h, c: "#F97316", label: "Mais de 1h" },
    { v: d.attendance.buckets.unanswered, c: RED, label: "Sem resposta" },
  ];
  return (
    <Document title={`Relatório do mês — ${d.clientName}`} author="Veloce.io">
      {/* CAPA */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório do mês</Text>
          <Text style={s.coverClient}>{d.clientName}</Text>
          {b && <Text style={s.coverHeadline}>{b.headline}</Text>}
          <View style={s.coverRule} />
          <View style={s.scoreRow}>
            <View style={[s.scoreBadge, { backgroundColor: d.health.color }]}>
              <Text style={s.scoreNum}>{d.hasData ? d.health.score : "—"}</Text>
              {d.hasData && <Text style={s.scoreMax}>de 100</Text>}
            </View>
            <View style={s.scoreMeta}>
              <Text style={s.scoreLabel}>Saúde do atendimento: {d.health.label}</Text>
              <Text style={s.scoreSub}>Mede cobertura (quantos leads são respondidos) e velocidade (quão rápido). Quanto mais alto, menos oportunidade perdida.</Text>
            </View>
          </View>
          <Meta label="Preparado para" value={d.clientName} />
          <Meta label="Por" value="Veloce.io" />
          <Meta label="Período" value={d.periodLabel} />
        </View>
        <Text style={s.coverBrandBottom}>veloce.io</Text>
      </Page>

      {/* DECISÃO — gargalo + ação + resultado */}
      <Page size="A4" style={s.page}>
        <View style={s.runHead}><Text style={s.runBrand}>{d.clientName}</Text><Text style={s.runMeta}>Relatório do mês · {d.periodLabel}</Text></View>

        {b ? (
          <>
            <Text style={s.kicker}>O gargalo do mês</Text>
            <Text style={s.title}>{b.title}</Text>
            <Text style={[s.lead, { marginTop: 8 }]}>{b.headline}</Text>

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
          </>
        ) : (
          <>
            <Text style={s.kicker}>O gargalo do mês</Text>
            <Text style={s.title}>Sem dados suficientes no período</Text>
            <Text style={s.lead}>Não há leads registrados no WhatsApp neste período para diagnosticar a operação.</Text>
          </>
        )}

        <Text style={s.secLabel}>O resultado no mês</Text>
        <View style={s.kpiGrid}>
          <Kpi label="Leads gerados" value={r.leads.value != null ? num(r.leads.value) : "—"} growth={r.leads.growthPct} />
          <Kpi label="Conversões" value={r.conversoes.value != null ? num(r.conversoes.value) : "—"} growth={r.conversoes.growthPct} />
          <Kpi label="Atendimento" value={r.taxaAtendimentoPct != null ? `${r.taxaAtendimentoPct}%` : "—"} />
          <Kpi label="Resposta (mediana)" value={fmtDur(r.tempoMedianoSec)} />
          <Kpi label="Investimento em mídia" value={r.investimento != null ? brl(r.investimento) : "—"} />
          <Kpi label="Custo por lead real" value={r.cplReal != null ? brl(r.cplReal) : "—"} />
        </View>
      </Page>

      {/* PROVAS */}
      {d.hasData && (
        <Page size="A4" style={s.page}>
          <View style={s.runHead}><Text style={s.runBrand}>{d.clientName}</Text><Text style={s.runMeta}>Relatório do mês · {d.periodLabel}</Text></View>
          <Text style={s.kicker}>Como chegamos nesse diagnóstico</Text>
          <Text style={s.proofTitle}>As evidências</Text>

          <Text style={s.secLabel}>Velocidade de resposta dos leads</Text>
          <View style={s.bar}>
            {buckets.map((g, i) => g.v > 0 ? <View key={i} style={{ flexGrow: g.v, backgroundColor: g.c }} /> : null)}
          </View>
          <View style={s.legendRow}>
            {buckets.map((g, i) => (
              <View key={i} style={s.legCell}>
                <View style={s.legTop}><View style={[s.dot, { backgroundColor: g.c }]} /><Text style={s.legCount}>{num(g.v)}</Text></View>
                <Text style={s.legLabel}>{g.label}</Text>
              </View>
            ))}
          </View>

          <Text style={s.secLabel}>Jornada dos leads (funil)</Text>
          {[
            { name: "Recebidos", v: fb.recebido },
            { name: "Atendidos", v: fb.atendido },
            { name: "Qualificados", v: fb.qualificado },
            { name: "Em negociação", v: fb.negociacao },
            { name: "Convertidos", v: fb.convertido },
          ].map((f, i) => (
            <View key={i} style={s.funnelRow}>
              <Text style={s.funnelName}>{f.name}</Text>
              <View style={s.funnelTrack}><View style={[s.funnelFill, { width: `${Math.round((f.v / fMax) * 100)}%` }]} /></View>
              <Text style={s.funnelVal}>{num(f.v)}</Text>
            </View>
          ))}

          {d.offHours.pct != null && (
            <Text style={[s.note, { color: MUTED }]}>
              {d.offHours.pct}% dos leads chegaram fora do horário comercial (antes das 8h, depois das 18h ou no fim de semana){d.offHours.peakHour != null ? `, com pico às ${String(d.offHours.peakHour).padStart(2, "0")}h` : ""} — janelas em que o atendimento automático evita que o lead fique esperando.
            </Text>
          )}

          <Text style={s.note}>Todos os números vêm do sistema real (mesma base do Painel e dos relatórios por canal). Quando um dado não existe, aparece como "—" — nada é estimado. Gerado em {d.generatedAt}.</Text>
        </Page>
      )}
    </Document>
  );
}

export function buildClientReport(data: ClientReportData) {
  return <ClientReportDoc data={data} />;
}
