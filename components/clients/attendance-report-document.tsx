import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/lib/pdf-fonts";

export interface AttendanceLead {
  name: string;
  origin: "ad" | "organic";
  metric: string;
  dateLabel: string;
}
export interface AttendanceBlock {
  leads: number;
  respondidos: number;
  taxaResposta: number;
  semResposta: number;
  tempoMedioSec: number | null;
  conversoes: number;
}
export interface AttendanceReportData {
  clientName: string;
  periodLabel: string;
  generatedAt: string;
  primary: AttendanceBlock;     // bloco em destaque (anúncio; geral só se não houver anúncio)
  primaryIsAd: boolean;
  buckets: { upTo5: number; upTo30: number; upTo60: number; over60: number; sem: number };
  tempoMedioSec: number | null;
  tempoMedioLabel: string;
  riskCount: number;            // respondidos +1h + sem resposta (no bloco em destaque)
  riskShare: number;
  narrative: string;
  noResponseList: AttendanceLead[];
  slowList: AttendanceLead[];
  lostList: AttendanceLead[];
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
  blockLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 },
  kpiGrid: { flexDirection: "row", gap: 9, marginBottom: 14 },
  kpiCell: { flex: 1, paddingVertical: 11, paddingHorizontal: 11, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 7.5, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
  // Banda de alerta (problema)
  alert: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", borderLeftWidth: 4, borderLeftColor: RED, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 15, marginBottom: 14 },
  alertRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  alertBig: { fontSize: 26, fontFamily: "Helvetica-Bold", color: RED, letterSpacing: -0.8, marginRight: 10 },
  alertHead: { fontSize: 11, fontFamily: "Helvetica-Bold", color: RED, flex: 1, lineHeight: 1.3 },
  alertText: { fontSize: 9.5, color: "#7F1D1D", lineHeight: 1.5 },
  adLabel: { fontSize: 8, color: RED, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 },
  para: { fontSize: 10.5, color: INK2, lineHeight: 1.55, marginBottom: 14 },
  // Distribuição do tempo de resposta
  secLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 7 },
  bar: { flexDirection: "row", height: 16, borderRadius: 5, overflow: "hidden", marginBottom: 8, backgroundColor: SOFT },
  legendRow: { flexDirection: "row", gap: 6 },
  legCell: { flex: 1, alignItems: "center", paddingVertical: 7, paddingHorizontal: 3, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  legTop: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  dot: { width: 7, height: 7, borderRadius: 2, marginRight: 4 },
  legCount: { fontSize: 13, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3 },
  legLabel: { fontSize: 7.5, color: MUTED, textAlign: "center" },
  // Tabelas de auditoria
  auditTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 3, letterSpacing: -0.2 },
  auditSub: { fontSize: 9, color: MUTED, marginBottom: 9, lineHeight: 1.45 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 5, marginBottom: 1 },
  th: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  cName: { flex: 1, fontSize: 9.5, color: INK2, paddingRight: 6 },
  cOrigin: { width: 78 },
  cMetric: { width: 120, fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "right", paddingRight: 8 },
  cDate: { width: 42, fontSize: 9, color: FAINT, textAlign: "right" },
  pill: { alignSelf: "flex-start", fontSize: 7.5, paddingVertical: 1.5, paddingHorizontal: 6, borderRadius: 3, overflow: "hidden", fontFamily: "Helvetica-Bold" },
  pillAd: { backgroundColor: "#EEF2FF", color: ACCENT },
  pillOrg: { backgroundColor: "#F1F5F9", color: MUTED },
  empty: { fontSize: 9, color: FAINT, paddingVertical: 6 },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  totalTxt: { fontSize: 8.5, color: MUTED },
  note: { fontSize: 8.5, color: FAINT, lineHeight: 1.5, marginTop: 16, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 9 },
  secGap: { marginTop: 22 },
});

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={s.metaRow}><Text style={s.metaLabel}>{label}</Text><Text style={s.metaValue}>{value}</Text></View>;
}
function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <View style={s.kpiCell}><Text style={s.kpiLabel}>{label}</Text><Text style={[s.kpiValue, { color: danger ? RED : INK }]}>{value}</Text></View>;
}
function KpiBlock({ b }: { b: AttendanceBlock }) {
  return (
    <View style={s.kpiGrid}>
      <Kpi label="Leads recebidos" value={num(b.leads)} />
      <Kpi label="Respondidos" value={`${b.taxaResposta}%`} danger={b.taxaResposta < 80} />
      <Kpi label="Sem resposta" value={num(b.semResposta)} danger={b.semResposta > 0} />
      <Kpi label="Tempo médio" value={b.tempoMedioSec != null ? fmtSec(b.tempoMedioSec) : "—"} danger={(b.tempoMedioSec ?? 0) > 1800} />
    </View>
  );
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) return rem ? `${h}h ${rem}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

function OriginPill({ origin }: { origin: "ad" | "organic" }) {
  return origin === "ad"
    ? <Text style={[s.pill, s.pillAd]}>Anúncio</Text>
    : <Text style={[s.pill, s.pillOrg]}>Orgânico</Text>;
}

function AuditTable({ title, sub, rows, metricHead, color, emptyMsg }: {
  title: string; sub: string; rows: AttendanceLead[]; metricHead: string; color: string; emptyMsg: string;
}) {
  return (
    <View style={s.secGap} wrap>
      <Text style={s.auditTitle}>{title}</Text>
      <Text style={s.auditSub}>{sub}</Text>
      {rows.length === 0 ? (
        <Text style={s.empty}>{emptyMsg}</Text>
      ) : (
        <>
          <View style={s.thead} fixed>
            <Text style={[s.th, { flex: 1 }]}>Lead</Text>
            <Text style={[s.th, s.cOrigin]}>Origem</Text>
            <Text style={[s.th, s.cMetric]}>{metricHead}</Text>
            <Text style={[s.th, s.cDate]}>Entrada</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.cName}>{r.name}</Text>
              <View style={s.cOrigin}><OriginPill origin={r.origin} /></View>
              <Text style={[s.cMetric, { color }]}>{r.metric}</Text>
              <Text style={s.cDate}>{r.dateLabel}</Text>
            </View>
          ))}
          <View style={s.totalRow}><Text style={s.totalTxt}>{num(rows.length)} lead{rows.length !== 1 ? "s" : ""} no total</Text></View>
        </>
      )}
    </View>
  );
}

function AttendanceDoc({ data: d }: { data: AttendanceReportData }) {
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

      {/* PANORAMA */}
      <Page size="A4" style={s.page}>
        <View style={s.runHead}><Text style={s.runBrand}>{d.clientName}</Text><Text style={s.runMeta}>Diagnóstico de Atendimento · {d.periodLabel}</Text></View>
        <Text style={s.kicker}>Panorama do atendimento</Text>
        <Text style={s.title}>Como os leads foram atendidos</Text>

        {/* Bloco em destaque — só leads de anúncio (mídia paga) */}
        <Text style={s.adLabel}>{d.primaryIsAd ? "Leads de anúncio (mídia paga)" : "Todos os leads (WhatsApp)"}</Text>
        <KpiBlock b={d.primary} />

        {/* Alerta de problema (tempo médio + leads em risco) */}
        {(d.tempoMedioSec != null && d.tempoMedioSec > 1800) || d.riskCount > 0 ? (
          <View style={s.alert}>
            <View style={s.alertRow}>
              <Text style={s.alertBig}>{d.tempoMedioLabel}</Text>
              <Text style={s.alertHead}>de tempo médio até a 1ª resposta{"\n"}— muito acima dos ~10 min em que o lead converte</Text>
            </View>
            <Text style={s.alertText}>
              {num(d.riskCount)} lead{d.riskCount !== 1 ? "s" : ""} de anúncio ({d.riskShare}% do total) foram respondidos só depois de 1 hora ou nunca tiveram resposta.
              Cada hora de espera esfria o lead: ele procura o concorrente e a venda se perde — mesmo já tendo sido pago pela mídia.
            </Text>
          </View>
        ) : null}

        <Text style={s.para}>{d.narrative}</Text>

        {/* Distribuição do tempo de resposta */}
        <Text style={s.secLabel}>Distribuição do tempo de resposta{d.primaryIsAd ? " — leads de anúncio" : ""}</Text>
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

        <Text style={s.note}>Este diagnóstico avalia a OPERAÇÃO e o PROCESSO de atendimento — não pessoas. Volume de leads acima da capacidade de resposta eleva o tempo de retorno; leads que esperam esfriam e convertem menos. Objetivo: dimensionar a capacidade (reforço de equipe e/ou atendimento automático) para aproveitar o investimento já feito em mídia. Gerado em {d.generatedAt}.</Text>
      </Page>

      {/* AUDITORIA (lista completa) */}
      <Page size="A4" style={s.page}>
        <View style={s.runHead}><Text style={s.runBrand}>{d.clientName}</Text><Text style={s.runMeta}>Auditoria de atendimento · {d.periodLabel}</Text></View>
        <Text style={s.kicker}>O que foi negligenciado</Text>
        <Text style={s.title}>Auditoria lead a lead</Text>

        <AuditTable
          title="Leads sem resposta"
          sub="Pessoas que chamaram e nunca receberam retorno no período. O vazamento mais direto da operação."
          rows={d.noResponseList}
          metricHead="Esperando"
          color={RED}
          emptyMsg="Nenhum — todo lead recebeu resposta."
        />

        <AuditTable
          title="Respondidos com mais de 1 hora"
          sub="Leads que até receberam resposta, mas tarde demais — fora da janela em que ainda estavam quentes."
          rows={d.slowList}
          metricHead="Tempo de resposta"
          color={AMBER}
          emptyMsg="Nenhum — todas as respostas saíram em menos de 1 hora."
        />

        <AuditTable
          title="Oportunidades de venda perdidas pela demora"
          sub="Leads que nunca foram respondidos ou só depois de 1 hora, não converteram e já esfriaram (sem atividade há mais de 24h). Casos em que a demora provavelmente custou a venda."
          rows={d.lostList}
          metricHead="O que aconteceu"
          color={RED}
          emptyMsg="Nenhuma oportunidade perdida identificada por demora."
        />

        <Text style={s.note}>Critério conservador: só entram leads frios (sem atividade há mais de 24h) que não converteram e tiveram resposta acima de 1 hora ou nenhuma resposta. Não inclui leads ainda em conversa. Gerado em {d.generatedAt}.</Text>
      </Page>
    </Document>
  );
}

export function buildAttendanceReport(data: AttendanceReportData) {
  return <AttendanceDoc data={data} />;
}
