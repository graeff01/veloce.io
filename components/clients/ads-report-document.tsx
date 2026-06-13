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
function statusLabel(st: string): string {
  if (st === "ACTIVE") return "Ativo";
  if (st === "PAUSED") return "Pausado";
  if (st === "ARCHIVED") return "Arquivado";
  return st;
}

// ── Paleta corporativa (clara, monocromática, sem roxo) — igual ao Executivo ──
const INK = "#0F172A";       // quase-preto
const INK2 = "#1E293B";
const MUTED = "#64748B";      // cinza texto
const FAINT = "#94A3B8";
const LINE = "#E2E8F0";       // linhas finas
const BG = "#FFFFFF";
const SOFT = "#F8FAFC";       // fundo sutil dos cards
const POS = "#067647";        // verde discreto (leads reais)

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
  coverAccount: { fontSize: 10, color: FAINT, marginTop: 6 },
  coverRule: { height: 1, backgroundColor: LINE, marginTop: 30, marginBottom: 18, width: 120 },
  coverFoot: { fontSize: 9, color: FAINT },
  coverBrandBottom: { position: "absolute", bottom: 54, left: 56, fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },

  // Seções
  sectionKicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  sectionTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3, marginBottom: 20 },

  // KPI grid — cards com fundo sutil para dar profundidade e separar os números
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 4 },
  kpiCell: { width: "31.5%", marginBottom: 12, paddingVertical: 15, paddingHorizontal: 14, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 8.5, color: MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 22, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5 },
  kpiValuePos: { fontSize: 22, fontFamily: "Helvetica-Bold", color: POS, letterSpacing: -0.5 },

  // Nota (honestidade dos dados)
  note: { fontSize: 8, color: FAINT, marginTop: 18, lineHeight: 1.5 },

  // Tabela (linhas finas, monocromática — igual à "Análise de evolução")
  tableLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  thead: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1.2, borderBottomColor: INK },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: "center" },
  tdName: { fontSize: 9.5, color: INK, fontFamily: "Helvetica-Bold" },
  tdSub: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  td: { fontSize: 9, color: INK2 },
  tdPos: { fontSize: 9.5, color: POS, fontFamily: "Helvetica-Bold" },
  empty: { fontSize: 10, color: MUTED, paddingVertical: 16 },

  // Colunas
  cName: { width: "28%" },
  cStatus: { width: "10%" },
  cMetric: { width: "13%", textAlign: "right" },
  cMetricLeads: { width: "10%", textAlign: "right" },

  footer: { position: "absolute", bottom: 30, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: FAINT },
});

function RunningHead({ data }: { data: AdsReportData }) {
  return (
    <View style={s.runningHead} fixed>
      <Text style={s.runningBrand}>{data.clientName}</Text>
      <Text style={s.runningMeta}>Relatório de Anúncios · {data.periodLabel}</Text>
    </View>
  );
}

function Footer({ data }: { data: AdsReportData }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Dados: Meta Ads + WhatsApp · Plataforma Veloce</Text>
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

function KpiCell({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <View style={s.kpiCell}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={positive ? s.kpiValuePos : s.kpiValue}>{value}</Text>
    </View>
  );
}

function TableHead() {
  return (
    <View style={s.thead}>
      <Text style={[s.th, s.cName]}>Nome</Text>
      <Text style={[s.th, s.cStatus]}>Status</Text>
      <Text style={[s.th, s.cMetric]}>Investim.</Text>
      <Text style={[s.th, s.cMetric]}>Impressões</Text>
      <Text style={[s.th, s.cMetric]}>CTR</Text>
      <Text style={[s.th, s.cMetricLeads]}>Leads</Text>
      <Text style={[s.th, s.cMetric]}>CPL real</Text>
    </View>
  );
}

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
      <Text style={[s.tdPos, s.cMetricLeads]}>{r.leads}</Text>
      <Text style={[s.td, s.cMetric]}>{r.cpl != null ? brl(r.cpl) : "—"}</Text>
    </View>
  );
}

function AdsReportDocument({ data }: { data: AdsReportData }) {
  const t = data.totals;
  return (
    <Document title={`Relatório de Anúncios — ${data.clientName}`} author="Plataforma Veloce">
      {/* ── CAPA ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório de Anúncios</Text>
          <Text style={s.coverClient}>{data.clientName}</Text>
          <Text style={s.coverTitle}>Performance de Anúncios</Text>
          <Text style={s.coverPeriod}>{data.periodLabel}</Text>
          {data.accountName ? <Text style={s.coverAccount}>Conta: {data.accountName}</Text> : null}
          <View style={s.coverRule} />
          <Text style={s.coverFoot}>Resumo gerado pela Plataforma Veloce</Text>
        </View>
        <Text style={s.coverBrandBottom}>veloce</Text>
      </Page>

      {/* ── P1 · VISÃO GERAL ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 1" title="Visão geral" />
        <View style={s.kpiGrid}>
          <KpiCell label="Investimento total" value={brl(t.spend)} />
          <KpiCell label="Leads reais (WhatsApp)" value={num(t.leads)} positive />
          <KpiCell label="CPL real" value={t.cpl != null ? brl(t.cpl) : "—"} />
          <KpiCell label="Conversão clique→lead" value={t.clicks > 0 ? pct((t.leads / t.clicks) * 100) : "—"} positive />
          <KpiCell label="CTR médio" value={pct(t.ctr)} />
          <KpiCell label="CPC médio" value={brl(t.cpc)} />
          <KpiCell label="Impressões" value={k(t.impressions)} />
          <KpiCell label="Cliques" value={num(t.clicks)} />
        </View>
        <Text style={s.note}>
          Leads reais = conversas efetivamente iniciadas no WhatsApp, atribuídas ao anúncio pelo ID oficial da Meta.
          O CPL real usa esse número (não os leads modelados da Meta), refletindo o resultado verdadeiro do investimento.
          A conversão clique→lead mede quantos cliques pagos viraram conversa real — o indicador de eficiência do investimento.
          {"  "}{data.campaignsCount} campanha(s) e {data.adsCount} anúncio(s) com atividade no período.
        </Text>
        <Footer data={data} />
      </Page>

      {/* ── P2 · DESEMPENHO (campanha + anúncio na mesma página) ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 2" title="Desempenho dos anúncios" />

        <View wrap={false}>
          <Text style={s.tableLabel}>Por campanha</Text>
          <TableHead />
        </View>
        {data.campaigns.length === 0
          ? <Text style={s.empty}>Sem campanhas com dados neste período.</Text>
          : data.campaigns.map((r, i) => <MetricRow key={`c${i}`} r={r} />)}

        <View wrap={false}>
          <Text style={[s.tableLabel, { marginTop: 26 }]}>Por anúncio</Text>
          <TableHead />
        </View>
        {data.ads.length === 0
          ? <Text style={s.empty}>Sem anúncios com dados neste período.</Text>
          : data.ads.map((r, i) => <MetricRow key={`a${i}`} r={r} showCampaign />)}

        <Footer data={data} />
      </Page>
    </Document>
  );
}

export function buildAdsReport(data: AdsReportData) {
  return <AdsReportDocument data={data} />;
}
