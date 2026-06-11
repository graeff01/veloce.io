import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface AdsReportRow {
  name: string;
  sub?: string | null;       // campanha do anúncio (opcional)
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  leads: number;             // leads REAIS (WhatsApp)
  cpl: number | null;        // CPL real
}

export interface AdsReportData {
  clientName: string;
  accountName: string | null;  // act_xxx ou nome da conta
  periodLabel: string;
  generatedAt: string;
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    leads: number;
    cpl: number | null;
  };
  campaigns: AdsReportRow[];
  ads: AdsReportRow[];
  campaignsCount: number;
  adsCount: number;
}

// ── Formatação ───────────────────────────────────────────────────────────────
function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function num(v: number): string {
  return v.toLocaleString("pt-BR");
}
function k(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}
function pct(v: number): string {
  return `${v.toFixed(2)}%`;
}
function statusLabel(s: string): string {
  if (s === "ACTIVE") return "Ativo";
  if (s === "PAUSED") return "Pausado";
  if (s === "ARCHIVED") return "Arquivado";
  return s;
}

const ACCENT = "#7C3AED";
const INK = "#1E1B2E";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const SOFT = "#F5F3FF";
const GREEN = "#16A34A";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK },
  brandDot: { color: ACCENT },
  brandSub: { fontSize: 8, color: MUTED, marginTop: 2 },
  reportTag: { fontSize: 8, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 16 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 3 },
  // Cards
  summary: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 8, flexWrap: "wrap" },
  card: { width: "31.5%", borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 10, backgroundColor: SOFT },
  cardValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ACCENT },
  cardValueGreen: { fontSize: 16, fontFamily: "Helvetica-Bold", color: GREEN },
  cardLabel: { fontSize: 7.5, color: MUTED, marginTop: 3 },
  // Nota honestidade
  note: { fontSize: 7.5, color: MUTED, marginTop: 6, marginBottom: 14, lineHeight: 1.4, fontStyle: "italic" },
  // Seção
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, marginTop: 8, marginBottom: 8 },
  // Tabela
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 6, overflow: "hidden", marginBottom: 18 },
  thead: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 10, backgroundColor: SOFT, borderBottomWidth: 1, borderBottomColor: LINE },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 },
  row: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: "center" },
  td: { fontSize: 8, color: INK },
  tdName: { fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold" },
  tdSub: { fontSize: 7, color: MUTED, marginTop: 1 },
  tdGreen: { fontSize: 8.5, color: GREEN, fontFamily: "Helvetica-Bold" },
  // Colunas — name flexível, métricas à direita
  cName: { width: "30%" },
  cStatus: { width: "10%" },
  cMetric: { width: "12%", textAlign: "right" },
  cMetricLeads: { width: "12%", textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: MUTED },
  empty: { fontSize: 8.5, color: MUTED, padding: 12, textAlign: "center" },
});

function MetricRow({ r, showCampaign }: { r: AdsReportRow; showCampaign?: boolean }) {
  return (
    <View style={s.row} wrap={false}>
      <View style={s.cName}>
        <Text style={s.tdName}>{r.name}</Text>
        {showCampaign && r.sub ? <Text style={s.tdSub}>{r.sub}</Text> : null}
      </View>
      <Text style={[s.td, s.cStatus]}>{statusLabel(r.status)}</Text>
      <Text style={[s.td, s.cMetric]}>{brl(r.spend)}</Text>
      <Text style={[s.td, s.cMetric]}>{k(r.impressions)}</Text>
      <Text style={[s.td, s.cMetric]}>{pct(r.ctr)}</Text>
      <Text style={[s.tdGreen, s.cMetricLeads]}>{r.leads}</Text>
      <Text style={[s.td, s.cMetric]}>{r.cpl != null ? brl(r.cpl) : "—"}</Text>
    </View>
  );
}

function TableHead() {
  return (
    <View style={s.thead}>
      <Text style={[s.th, s.cName]}>Nome</Text>
      <Text style={[s.th, s.cStatus]}>Status</Text>
      <Text style={[s.th, s.cMetric]}>Investim.</Text>
      <Text style={[s.th, s.cMetric]}>Impr.</Text>
      <Text style={[s.th, s.cMetric]}>CTR</Text>
      <Text style={[s.th, s.cMetricLeads]}>Leads reais</Text>
      <Text style={[s.th, s.cMetric]}>CPL real</Text>
    </View>
  );
}

function AdsReportDocument({ data }: { data: AdsReportData }) {
  const t = data.totals;
  return (
    <Document title={`Relatório de Anúncios — ${data.clientName}`} author="veloce.io">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>veloce<Text style={s.brandDot}>.io</Text></Text>
            <Text style={s.brandSub}>Gestão de tráfego e performance</Text>
          </View>
          <Text style={s.reportTag}>Relatório de Performance de Anúncios</Text>
        </View>
        <View style={s.rule} />

        <Text style={s.title}>{data.clientName}</Text>
        <Text style={s.subtitle}>
          Período: {data.periodLabel}
          {data.accountName ? `  ·  Conta: ${data.accountName}` : ""}
        </Text>

        {/* ── Métricas Gerais ── */}
        <Text style={s.sectionTitle}>Visão geral</Text>
        <View style={s.summary}>
          <View style={s.card}>
            <Text style={s.cardValue}>{brl(t.spend)}</Text>
            <Text style={s.cardLabel}>Investimento total</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardValueGreen}>{t.leads}</Text>
            <Text style={s.cardLabel}>Leads reais (WhatsApp)</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardValue}>{t.cpl != null ? brl(t.cpl) : "—"}</Text>
            <Text style={s.cardLabel}>CPL real</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardValue}>{pct(t.ctr)}</Text>
            <Text style={s.cardLabel}>CTR médio</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardValue}>{k(t.impressions)}</Text>
            <Text style={s.cardLabel}>Impressões</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardValue}>{num(t.clicks)}</Text>
            <Text style={s.cardLabel}>Cliques</Text>
          </View>
        </View>

        <Text style={s.note}>
          Leads reais = conversas efetivamente iniciadas no WhatsApp, atribuídas ao anúncio pelo ID oficial da Meta.
          O CPL real usa esse número (não os leads modelados da Meta), refletindo o resultado verdadeiro do investimento.
          {"  "}{data.campaignsCount} campanha(s) e {data.adsCount} anúncio(s) com atividade no período.
        </Text>

        {/* ── Por Campanha ── */}
        <Text style={s.sectionTitle}>Por campanha</Text>
        <View style={s.table}>
          <TableHead />
          {data.campaigns.length === 0
            ? <Text style={s.empty}>Sem campanhas com dados neste período.</Text>
            : data.campaigns.map((r, i) => <MetricRow key={`c${i}`} r={r} />)}
        </View>

        {/* ── Por Anúncio ── */}
        <Text style={s.sectionTitle}>Por anúncio</Text>
        <View style={s.table}>
          <TableHead />
          {data.ads.length === 0
            ? <Text style={s.empty}>Sem anúncios com dados neste período.</Text>
            : data.ads.map((r, i) => <MetricRow key={`a${i}`} r={r} showCampaign />)}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Dados: Meta Ads + WhatsApp  ·  veloce.io</Text>
          <Text style={s.footerText}>Gerado em {data.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}

export function buildAdsReport(data: AdsReportData) {
  return <AdsReportDocument data={data} />;
}
