import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/lib/pdf-fonts";

export interface AttendanceRow { name: string; metric: string }
export interface AttendanceReportData {
  clientName: string;
  periodLabel: string;
  generatedAt: string;
  totals: { leads: number; respondidos: number; taxaResposta: number; semResposta: number; tempoMedioMin: number | null; conversoes: number };
  ads: { leads: number; semResposta: number; conversoes: number } | null;
  narrative: string;
  semRespostaList: AttendanceRow[]; // top 5
  slowest: AttendanceRow[];        // top 5
}

const num = (v: number) => v.toLocaleString("pt-BR");

const INK = "#0F172A", MUTED = "#64748B", FAINT = "#94A3B8", LINE = "#E2E8F0";
const BG = "#FFFFFF", SOFT = "#F8FAFC", RED = "#B42318", AMBER = "#B45309", ACCENT = "#4F46E5";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },
  kicker: { fontSize: 9, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.6 },
  h1: { fontSize: 22, fontFamily: "Inter Tight", fontWeight: 800, color: INK, marginTop: 6, letterSpacing: -0.4 },
  meta: { fontSize: 10, color: MUTED, marginTop: 6 },
  rule: { height: 2, backgroundColor: LINE, marginVertical: 16 },
  kpiGrid: { flexDirection: "row", gap: 10, marginBottom: 14 },
  kpiCell: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 7.5, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 19, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
  adBox: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 8, padding: 12, marginBottom: 14 },
  adLabel: { fontSize: 8, color: RED, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  adText: { fontSize: 11, color: INK, lineHeight: 1.5 },
  para: { fontSize: 11, color: "#1E293B", lineHeight: 1.6, marginBottom: 16 },
  cols: { flexDirection: "row", gap: 18 },
  col: { flex: 1 },
  colTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 7 },
  tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  tName: { fontSize: 9.5, color: "#1E293B", flex: 1, paddingRight: 6 },
  empty: { fontSize: 9, color: FAINT, paddingVertical: 6 },
  note: { fontSize: 8.5, color: FAINT, lineHeight: 1.5, marginTop: 20, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 },
});

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <View style={s.kpiCell}><Text style={s.kpiLabel}>{label}</Text><Text style={[s.kpiValue, { color: danger ? RED : INK }]}>{value}</Text></View>;
}

function AttendanceDoc({ data: d }: { data: AttendanceReportData }) {
  const t = d.totals;
  return (
    <Document title={`Diagnóstico de Atendimento — ${d.clientName}`} author="Veloce.io">
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>Diagnóstico de Atendimento</Text>
        <Text style={s.h1}>{d.clientName}</Text>
        <Text style={s.meta}>Velocidade de resposta e impacto na conversão · {d.periodLabel} · por Veloce.io</Text>
        <View style={s.rule} />

        <View style={s.kpiGrid}>
          <Kpi label="Leads recebidos" value={num(t.leads)} />
          <Kpi label="Respondidos" value={`${t.taxaResposta}%`} />
          <Kpi label="Sem resposta" value={num(t.semResposta)} danger={t.semResposta > 0} />
          <Kpi label="Tempo médio" value={t.tempoMedioMin != null ? `${num(t.tempoMedioMin)} min` : "—"} danger={(t.tempoMedioMin ?? 0) > 30} />
        </View>

        {d.ads && (
          <View style={s.adBox}>
            <Text style={s.adLabel}>Leads de anúncio (investimento em mídia)</Text>
            <Text style={s.adText}>
              {num(d.ads.leads)} leads gerados pelos anúncios · {num(d.ads.semResposta)} ficaram sem resposta · {num(d.ads.conversoes)} convertido{d.ads.conversoes !== 1 ? "s" : ""}.
            </Text>
          </View>
        )}

        <Text style={s.para}>{d.narrative}</Text>

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.colTitle}>Leads ainda sem resposta</Text>
            {d.semRespostaList.length === 0 ? <Text style={s.empty}>Nenhum — tudo respondido. 👏</Text> : d.semRespostaList.map((r, i) => (
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
