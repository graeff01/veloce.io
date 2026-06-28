import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/lib/pdf-fonts";

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface GoogleReportData {
  clientName: string;
  accountName: string | null;
  periodLabel: string;
  generatedAt: string;
  health: { score: number; label: string; factors: { label: string; delta: number }[] };
  totals: { spend: number; conversions: number; impressions: number; clicks: number };
  deltas?: { spend: number | null; conversions: number | null; clicks: number | null; impressions: number | null } | null;
  impressionShare: number | null;
  waste: { amount: number; count: number };
  campaigns: { name: string; status: string; spend: number; conversions: number; impressionShare: number | null }[];
  searchTerms: { term: string; spend: number; conversions: number }[];
  keywords: { keyword: string; spend: number; conversions: number; qualityScore: number | null }[];
  diagnostics: { severity: string; title: string; detail: string | null }[];
  changes: { changedAt: string; userEmail: string | null; summary: string | null }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const delta = (v: number | null | undefined) => (v == null ? "" : `${v >= 0 ? "+" : ""}${v}%`);

// ── Paleta (igual aos demais relatórios) ──
const INK = "#0F172A", INK2 = "#1E293B", MUTED = "#64748B", FAINT = "#94A3B8";
const LINE = "#E2E8F0", BG = "#FFFFFF", SOFT = "#F8FAFC", CAMPBG = "#E7ECF3";
const POS = "#067647", NEG = "#B42318", ACCENT = "#4285F4"; // azul Google

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },
  runningHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  runningBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 0.3 },
  runningMeta: { fontSize: 8, color: FAINT },
  cover: { flex: 1, justifyContent: "center", paddingHorizontal: 56 },
  coverKicker: { fontSize: 9, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 2, marginBottom: 22 },
  coverClient: { fontSize: 36, fontFamily: "Inter Tight", fontWeight: 800, color: INK, letterSpacing: -0.6, lineHeight: 1.05 },
  coverTitle: { fontSize: 13, color: INK2, marginTop: 26, fontFamily: "Helvetica-Bold", lineHeight: 1.45 },
  coverRule: { height: 3, backgroundColor: ACCENT, marginTop: 26, marginBottom: 24, width: 44, borderRadius: 2 },
  coverBrandBottom: { position: "absolute", bottom: 54, left: 56, fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  metaBlock: { marginTop: 2 },
  metaRow: { flexDirection: "row", marginBottom: 9 },
  metaLabel: { width: 120, fontSize: 8.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 1 },
  metaValue: { fontSize: 11, color: INK, fontFamily: "Helvetica-Bold", flex: 1 },
  sectionKicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  sectionTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3, marginBottom: 18 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 4 },
  kpiCell: { width: "31.5%", marginBottom: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 8.5, color: MUTED, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5 },
  kpiValuePos: { fontSize: 20, fontFamily: "Helvetica-Bold", color: POS, letterSpacing: -0.5 },
  kpiDelta: { fontSize: 8, marginTop: 4, fontFamily: "Helvetica-Bold" },
  // Saúde
  healthBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 16, marginTop: 6, backgroundColor: SOFT },
  healthScore: { fontSize: 40, fontFamily: "Helvetica-Bold", letterSpacing: -1, width: 90 },
  healthFactor: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  // Tabelas
  tHead: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 12, borderBottomWidth: 1.2, borderBottomColor: INK },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: LINE },
  td: { fontSize: 9, color: INK2 },
  group: { marginTop: 8, borderWidth: 1, borderColor: LINE, borderRadius: 8, overflow: "hidden", backgroundColor: BG },
  campRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 12, backgroundColor: CAMPBG },
  diagRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: LINE },
  diagDot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 },
  note: { fontSize: 8, color: FAINT, marginTop: 16, lineHeight: 1.5 },
  sectionLead: { fontSize: 9.5, color: MUTED, lineHeight: 1.5, marginBottom: 14 },
  cName: { width: "52%" }, cM: { width: "16%", textAlign: "right" },
  footer: { position: "absolute", bottom: 30, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: FAINT },
});

function MetaRow({ label, value }: { label: string; value: string }) {
  return <View style={s.metaRow}><Text style={s.metaLabel}>{label}</Text><Text style={s.metaValue}>{value}</Text></View>;
}
function RunningHead({ data }: { data: GoogleReportData }) {
  return <View style={s.runningHead} fixed><Text style={s.runningBrand}>{data.clientName}</Text><Text style={s.runningMeta}>Relatório de Google Ads · {data.periodLabel}</Text></View>;
}
function Footer({ data }: { data: GoogleReportData }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Dados: Google Ads · Veloce.io</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      <Text style={s.footerText}>Gerado em {data.generatedAt}</Text>
    </View>
  );
}
function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return <View><Text style={s.sectionKicker}>{kicker}</Text><Text style={s.sectionTitle}>{title}</Text></View>;
}
function Kpi({ label, value, positive, d, good }: { label: string; value: string; positive?: boolean; d?: number | null; good?: boolean }) {
  const dColor = d == null ? MUTED : good === undefined ? MUTED : (d >= 0) === good ? POS : NEG;
  return (
    <View style={s.kpiCell}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={positive ? s.kpiValuePos : s.kpiValue}>{value}</Text>
      {d != null ? <Text style={[s.kpiDelta, { color: dColor }]}>{delta(d)} vs. anterior</Text> : null}
    </View>
  );
}

function GoogleReportDocument({ data }: { data: GoogleReportData }) {
  const t = data.totals;
  const sevColor: Record<string, string> = { ok: POS, info: ACCENT, warn: "#B45309", error: NEG };
  return (
    <Document title={`Relatório de Google Ads — ${data.clientName}`} author="Veloce.io">
      {/* CAPA */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório de Google Ads</Text>
          <Text style={s.coverClient}>{data.clientName}</Text>
          <Text style={s.coverTitle}>Performance e Auditoria · Google Ads</Text>
          <View style={s.coverRule} />
          <View style={s.metaBlock}>
            <MetaRow label="Preparado para" value={data.clientName} />
            <MetaRow label="Por" value="Veloce.io" />
            <MetaRow label="Período" value={data.periodLabel} />
            {data.accountName ? <MetaRow label="Conta" value={data.accountName} /> : null}
          </View>
        </View>
        <Text style={s.coverBrandBottom}>veloce.io</Text>
      </Page>

      {/* P1 · VISÃO GERAL + SAÚDE */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 1" title="Visão geral" />
        <View style={s.kpiGrid}>
          <Kpi label="Investimento" value={brl(t.spend)} d={data.deltas?.spend} />
          <Kpi label="Conversões" value={num(t.conversions)} positive d={data.deltas?.conversions} good />
          <Kpi label="Parcela de impressões" value={pct(data.impressionShare)} />
          <Kpi label="Impressões" value={num(t.impressions)} d={data.deltas?.impressions} good />
          <Kpi label="Cliques" value={num(t.clicks)} d={data.deltas?.clicks} good />
          <Kpi label="Desperdício" value={brl(data.waste.amount)} />
        </View>

        <SectionHead kicker="Auditoria" title="Saúde da conta" />
        <View style={s.healthBox}>
          <Text style={[s.healthScore, { color: data.health.score >= 70 ? POS : data.health.score >= 50 ? "#B45309" : NEG }]}>{data.health.score}</Text>
          <View style={{ flex: 1, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: LINE }}>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>{data.health.label}</Text>
            {data.health.factors.length === 0
              ? <Text style={{ fontSize: 9, color: POS }}>Nenhum problema detectado — conta saudável.</Text>
              : data.health.factors.map((f, i) => (
                <View key={i} style={s.healthFactor}><Text style={{ fontSize: 9, color: INK2 }}>{f.label}</Text><Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: NEG }}>{f.delta}</Text></View>
              ))}
          </View>
        </View>
        <Text style={s.note}>A nota parte de 100 e desconta por problemas reais (rastreamento, reprovações, limite de orçamento, desperdício e parcela de impressões), com pesos fixos — mesma entrada, mesma nota.</Text>
        <Footer data={data} />
      </Page>

      {/* P2 · CAMPANHAS + BUSCAS */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 2" title="Campanhas e buscas" />
        <View style={s.group}>
          <View style={s.tHead}><Text style={[s.th, s.cName]}>Campanha</Text><Text style={[s.th, s.cM]}>Conv.</Text><Text style={[s.th, s.cM]}>Parc. impr.</Text><Text style={[s.th, s.cM]}>Investim.</Text></View>
          {data.campaigns.map((c, i) => (
            <View key={i} style={s.campRow}><Text style={[s.td, s.cName, { fontFamily: "Helvetica-Bold" }]}>{c.name}</Text><Text style={[s.td, s.cM, { color: POS, fontFamily: "Helvetica-Bold" }]}>{num(c.conversions)}</Text><Text style={[s.td, s.cM]}>{pct(c.impressionShare)}</Text><Text style={[s.td, s.cM, { fontFamily: "Helvetica-Bold" }]}>{brl(c.spend)}</Text></View>
          ))}
        </View>

        <Text style={[s.sectionTitle, { fontSize: 13, marginTop: 22, marginBottom: 10 }]}>Termos de busca · o que as pessoas digitaram</Text>
        <View style={s.group}>
          <View style={s.tHead}><Text style={[s.th, { width: "60%" }]}>Termo</Text><Text style={[s.th, s.cM]}>Conv.</Text><Text style={[s.th, { width: "24%", textAlign: "right" }]}>Investim.</Text></View>
          {data.searchTerms.slice(0, 12).map((x, i) => (
            <View key={i} style={s.tRow}><Text style={[s.td, { width: "60%", color: x.conversions === 0 && x.spend > 0 ? NEG : INK2 }]}>{x.term}</Text><Text style={[s.td, s.cM]}>{num(x.conversions)}</Text><Text style={[s.td, { width: "24%", textAlign: "right" }]}>{brl(x.spend)}</Text></View>
          ))}
        </View>
        <Text style={s.note}>Termos em vermelho gastaram sem gerar conversão — candidatos a palavra-chave negativa.</Text>
        <Footer data={data} />
      </Page>

      {/* P3 · AUDITORIA */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 3" title="Auditoria da conta" />
        <Text style={[s.sectionTitle, { fontSize: 13, marginBottom: 10 }]}>Diagnóstico</Text>
        <View style={s.group}>
          {data.diagnostics.map((d, i) => (
            <View key={i} style={s.diagRow}><View style={[s.diagDot, { backgroundColor: sevColor[d.severity] ?? MUTED }]} /><View style={{ flex: 1 }}><Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold" }}>{d.title}</Text>{d.detail ? <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>{d.detail}</Text> : null}</View></View>
          ))}
        </View>

        <Text style={[s.sectionTitle, { fontSize: 13, marginTop: 22, marginBottom: 10 }]}>Histórico de mudanças</Text>
        <View style={s.group}>
          {data.changes.slice(0, 15).map((c, i) => (
            <View key={i} style={s.diagRow}><View style={{ flex: 1 }}><Text style={{ fontSize: 9.5, color: INK2 }}>{c.summary ?? "Alteração"}</Text><Text style={{ fontSize: 8, color: FAINT, marginTop: 1 }}>{c.userEmail ?? "—"} · {new Date(c.changedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text></View></View>
          ))}
        </View>
        <Text style={s.note}>Auditoria completa do que foi alterado na conta — transparência total sobre o trabalho.</Text>
        <Footer data={data} />
      </Page>
    </Document>
  );
}

export function buildGoogleReport(data: GoogleReportData) {
  return <GoogleReportDocument data={data} />;
}
