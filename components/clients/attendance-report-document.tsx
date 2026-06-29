import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/lib/pdf-fonts";

export interface AttendanceRow { name: string; metric: string }
export interface AttendanceReportData {
  clientName: string;
  periodLabel: string;
  generatedAt: string;
  totals: { leads: number; respondidos: number; taxaResposta: number; semResposta: number; tempoMedioMin: number | null; conversoes: number };
  buckets: { upTo5: number; upTo30: number; upTo60: number; over60: number; sem: number };
  ads: { leads: number; semResposta: number; conversoes: number } | null;
  narrative: string;
  semRespostaList: AttendanceRow[];
  slowest: AttendanceRow[];
}

const num = (v: number) => v.toLocaleString("pt-BR");

const INK = "#0F172A", INK2 = "#1E293B", MUTED = "#64748B", FAINT = "#94A3B8", LINE = "#E2E8F0";
const BG = "#FFFFFF", SOFT = "#F8FAFC", RED = "#B42318", AMBER = "#B45309", ACCENT = "#4F46E5";
const GREEN = "#16A34A", LIME = "#65A30D", ORANGE = "#F97316";

const s = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 56, paddingHorizontal: 50, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },
  // Capa (modelo Veloce)
  cover: { flex: 1, justifyContent: "center", paddingHorizontal: 6 },
  coverKicker: { fontSize: 9, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 2, marginBottom: 22 },
  coverClient: { fontSize: 36, fontFamily: "Inter Tight", fontWeight: 800, color: INK, letterSpacing: -0.6, lineHeight: 1.05 },
  coverTitle: { fontSize: 13, color: INK2, marginTop: 26, fontFamily: "Helvetica-Bold", lineHeight: 1.45 },
  coverRule: { height: 3, backgroundColor: ACCENT, marginTop: 26, marginBottom: 24, width: 44, borderRadius: 2 },
  metaRow: { flexDirection: "row", marginBottom: 9 },
  metaLabel: { width: 120, fontSize: 8.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 1 },
  metaValue: { fontSize: 11, color: INK, fontFamily: "Helvetica-Bold", flex: 1 },
  coverBrandBottom: { position: "absolute", bottom: 50, left: 50, fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  // Conteúdo
  runHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  runBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  runMeta: { fontSize: 8, color: FAINT },
  kicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 5 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 14, letterSpacing: -0.3 },
  kpiGrid: { flexDirection: "row", gap: 9, marginBottom: 13 },
  kpiCell: { flex: 1, paddingVertical: 11, paddingHorizontal: 11, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 7.5, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
  adBox: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 8, padding: 11, marginBottom: 13 },
  adLabel: { fontSize: 8, color: RED, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  adText: { fontSize: 11, color: INK, lineHeight: 1.5 },
  para: { fontSize: 10.5, color: INK2, lineHeight: 1.55, marginBottom: 14 },
  // Distribuição do tempo de resposta
  secLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 7 },
  bar: { flexDirection: "row", height: 16, borderRadius: 5, overflow: "hidden", marginBottom: 8, backgroundColor: SOFT },
  legendRow: { flexDirection: "row", gap: 6, marginBottom: 16 },
  legCell: { flex: 1, alignItems: "center", paddingVertical: 7, paddingHorizontal: 3, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  legTop: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  dot: { width: 7, height: 7, borderRadius: 2, marginRight: 4 },
  legCount: { fontSize: 13, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3 },
  legLabel: { fontSize: 7.5, color: MUTED, textAlign: "center" },
  cols: { flexDirection: "row", gap: 18 },
  col: { flex: 1 },
  colTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 6 },
  tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  tName: { fontSize: 9.5, color: INK2, flex: 1, paddingRight: 6 },
  empty: { fontSize: 9, color: FAINT, paddingVertical: 5 },
  note: { fontSize: 8.5, color: FAINT, lineHeight: 1.5, marginTop: 16, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 9 },
});

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={s.metaRow}><Text style={s.metaLabel}>{label}</Text><Text style={s.metaValue}>{value}</Text></View>;
}
function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <View style={s.kpiCell}><Text style={s.kpiLabel}>{label}</Text><Text style={[s.kpiValue, { color: danger ? RED : INK }]}>{value}</Text></View>;
}

function AttendanceDoc({ data: d }: { data: AttendanceReportData }) {
  const t = d.totals;
  const b = d.buckets;
  const segs = [
    { v: b.upTo5, c: GREEN, label: "Até 5 min" },
    { v: b.upTo30, c: LIME, label: "5 a 30 min" },
    { v: b.upTo60, c: AMBER, label: "30 a 60 min" },
    { v: b.over60, c: ORANGE, label: "Mais de 1h" },
    { v: b.sem, c: RED, label: "Sem resposta" },
  ];
  return (
    <Document title={`Diagnóstico de Atendimento — ${d.clientName}`} author="Veloce.io">
      {/* CAPA (modelo) */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Diagnóstico de Atendimento</Text>
          <Text style={s.coverClient}>{d.clientName}</Text>
          <Text style={s.coverTitle}>Velocidade de resposta e impacto na conversão dos leads</Text>
          <View style={s.coverRule} />
          <Meta label="Preparado para" value={d.clientName} />
          <Meta label="Por" value="Veloce.io" />
          <Meta label="Período" value={d.periodLabel} />
        </View>
        <Text style={s.coverBrandBottom}>veloce.io</Text>
      </Page>

      {/* CONTEÚDO (1 página) */}
      <Page size="A4" style={s.page}>
        <View style={s.runHead}><Text style={s.runBrand}>{d.clientName}</Text><Text style={s.runMeta}>Diagnóstico de Atendimento · {d.periodLabel}</Text></View>
        <Text style={s.kicker}>Panorama do atendimento</Text>
        <Text style={s.title}>Como os leads foram atendidos</Text>

        <View style={s.kpiGrid}>
          <Kpi label="Leads recebidos" value={num(t.leads)} />
          <Kpi label="Respondidos" value={`${t.taxaResposta}%`} />
          <Kpi label="Sem resposta" value={num(t.semResposta)} danger={t.semResposta > 0} />
          <Kpi label="Tempo médio" value={t.tempoMedioMin != null ? `${num(t.tempoMedioMin)} min` : "—"} danger={(t.tempoMedioMin ?? 0) > 30} />
        </View>

        {d.ads && (
          <View style={s.adBox}>
            <Text style={s.adLabel}>Leads de anúncio (investimento em mídia)</Text>
            <Text style={s.adText}>{num(d.ads.leads)} leads gerados pelos anúncios · {num(d.ads.semResposta)} ficaram sem resposta · {num(d.ads.conversoes)} convertido{d.ads.conversoes !== 1 ? "s" : ""}.</Text>
          </View>
        )}

        <Text style={s.para}>{d.narrative}</Text>

        {/* Distribuição do tempo de resposta */}
        <Text style={s.secLabel}>Distribuição do tempo de resposta</Text>
        <View style={s.bar}>
          {segs.map((g, i) => g.v > 0 ? <View key={i} style={{ flexGrow: g.v, backgroundColor: g.c }} /> : null)}
        </View>
        <View style={s.legendRow}>
          {segs.map((g, i) => (
            <View key={i} style={s.legCell}>
              <View style={s.legTop}><View style={[s.dot, { backgroundColor: g.c }]} /><Text style={s.legCount}>{num(g.v)}</Text></View>
              <Text style={s.legLabel}>{g.label}</Text>
            </View>
          ))}
        </View>

        {/* Listas */}
        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.colTitle}>Leads ainda sem resposta</Text>
            {d.semRespostaList.length === 0 ? <Text style={s.empty}>Nenhum — tudo respondido.</Text> : d.semRespostaList.map((r, i) => (
              <View key={i} style={s.tRow}><Text style={s.tName}>{r.name}</Text><Text style={{ fontSize: 9.5, color: RED, fontFamily: "Helvetica-Bold" }}>{r.metric}</Text></View>
            ))}
          </View>
          <View style={s.col}>
            <Text style={s.colTitle}>Respostas mais demoradas</Text>
            {d.slowest.length === 0 ? <Text style={s.empty}>Sem dados no período.</Text> : d.slowest.map((r, i) => (
              <View key={i} style={s.tRow}><Text style={s.tName}>{r.name}</Text><Text style={{ fontSize: 9.5, color: AMBER, fontFamily: "Helvetica-Bold" }}>{r.metric}</Text></View>
            ))}
          </View>
        </View>

        <Text style={s.note}>Este diagnóstico avalia a OPERAÇÃO e o PROCESSO de atendimento — não pessoas. Volume de leads acima da capacidade de resposta eleva o tempo de retorno; leads que esperam esfriam e convertem menos. Objetivo: dimensionar a capacidade (reforço de equipe e/ou atendimento automático) para aproveitar o investimento já feito em mídia. Gerado em {d.generatedAt}.</Text>
      </Page>
    </Document>
  );
}

export function buildAttendanceReport(data: AttendanceReportData) {
  return <AttendanceDoc data={data} />;
}
