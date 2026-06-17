import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface DeliverableItem {
  title: string;
  date: string;            // data de entrega (dd/mm)
  description?: string | null;
}
export interface DeliverableGroup {
  type: string;            // categoria do entregável (Post Feed, Story, Reels, ...)
  count: number;
  items: DeliverableItem[];
}
export interface DeliverablesReportData {
  clientName: string;
  responsavel: string | null;
  periodLabel: string;
  generatedAt: string;
  total: number;           // total de entregas (concluídas, exceto tarefas internas)
  groups: DeliverableGroup[];
}

// ── Paleta corporativa (mesma do Relatório de Anúncios/Executivo) ─────────────
const INK = "#0F172A";
const INK2 = "#1E293B";
const MUTED = "#64748B";
const FAINT = "#94A3B8";
const LINE = "#E2E8F0";
const BG = "#FFFFFF";
const SOFT = "#F8FAFC";
const CATBG = "#E7ECF3";     // faixa da categoria (igual à campanha do relatório de anúncios)
const POS = "#067647";       // verde discreto (entregas)

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },

  runningHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  runningBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 0.3 },
  runningMeta: { fontSize: 8, color: FAINT },

  cover: { flex: 1, justifyContent: "center", paddingHorizontal: 56 },
  coverKicker: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 2, marginBottom: 22 },
  coverClient: { fontSize: 34, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5, lineHeight: 1.1 },
  coverTitle: { fontSize: 13, color: INK2, marginTop: 26, fontFamily: "Helvetica-Bold" },
  coverPeriod: { fontSize: 13, color: MUTED, marginTop: 4 },
  coverAccount: { fontSize: 10, color: FAINT, marginTop: 6 },
  coverRule: { height: 1, backgroundColor: LINE, marginTop: 30, marginBottom: 18, width: 120 },
  coverFoot: { fontSize: 9, color: FAINT },
  coverBrandBottom: { position: "absolute", bottom: 54, left: 56, fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },

  sectionKicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  sectionTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3, marginBottom: 20 },
  sectionLead: { fontSize: 9.5, color: MUTED, lineHeight: 1.5, marginBottom: 16 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 4 },
  kpiCell: { width: "31.5%", marginBottom: 12, paddingVertical: 15, paddingHorizontal: 14, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 8.5, color: MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 22, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5 },
  kpiValuePos: { fontSize: 22, fontFamily: "Helvetica-Bold", color: POS, letterSpacing: -0.5 },

  note: { fontSize: 8, color: FAINT, marginTop: 18, lineHeight: 1.5 },

  // Categoria (card) → itens entregues (lista)
  group: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 8, overflow: "hidden", backgroundColor: BG },
  catRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: CATBG, borderBottomWidth: 1, borderBottomColor: LINE },
  catName: { fontSize: 10.5, color: INK, fontFamily: "Helvetica-Bold" },
  catCount: { fontSize: 8.5, color: MUTED, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },

  itemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 7, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: LINE },
  itemDate: { width: "16%", fontSize: 8.5, color: MUTED, fontFamily: "Helvetica-Bold", paddingTop: 1 },
  itemBody: { width: "84%" },
  itemTitle: { fontSize: 9.5, color: INK2 },
  itemDesc: { fontSize: 8, color: FAINT, marginTop: 2, lineHeight: 1.4 },

  footer: { position: "absolute", bottom: 30, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: FAINT },
});

function RunningHead({ data }: { data: DeliverablesReportData }) {
  return (
    <View style={s.runningHead} fixed>
      <Text style={s.runningBrand}>{data.clientName}</Text>
      <Text style={s.runningMeta}>Relatório de Entregas · {data.periodLabel}</Text>
    </View>
  );
}

function Footer({ data }: { data: DeliverablesReportData }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Entregas do mês · Plataforma Veloce</Text>
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

function CategoryGroup({ group }: { group: DeliverableGroup }) {
  return (
    <View style={s.group} wrap={false}>
      <View style={s.catRow}>
        <Text style={s.catName}>{group.type}</Text>
        <Text style={s.catCount}>{group.count} {group.count === 1 ? "entrega" : "entregas"}</Text>
      </View>
      {group.items.map((it, i) => (
        <View key={i} style={[s.itemRow, i === group.items.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
          <Text style={s.itemDate}>{it.date}</Text>
          <View style={s.itemBody}>
            <Text style={s.itemTitle}>{it.title}</Text>
            {it.description ? <Text style={s.itemDesc}>{it.description}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function DeliverablesReportDocument({ data }: { data: DeliverablesReportData }) {
  const categorias = data.groups.length;
  return (
    <Document title={`Relatório de Entregas — ${data.clientName}`} author="Plataforma Veloce">
      {/* ── CAPA ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório de Entregas</Text>
          <Text style={s.coverClient}>{data.clientName}</Text>
          <Text style={s.coverTitle}>O que entregamos no mês</Text>
          <Text style={s.coverPeriod}>{data.periodLabel}</Text>
          {data.responsavel ? <Text style={s.coverAccount}>Responsável: {data.responsavel}</Text> : null}
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
          <KpiCell label="Entregas no mês" value={String(data.total)} positive />
          <KpiCell label="Categorias" value={String(categorias)} />
          {data.groups.slice(0, 7).map((g) => (
            <KpiCell key={g.type} label={g.type} value={String(g.count)} />
          ))}
        </View>
        <Text style={s.note}>
          Este relatório reúne tudo o que foi efetivamente entregue ao cliente no período — posts, stories, reels,
          campanhas, criativos e demais materiais concluídos. Tarefas internas de organização não entram aqui.
          {"  "}Foram {data.total} {data.total === 1 ? "entrega realizada" : "entregas realizadas"} em {categorias} {categorias === 1 ? "categoria" : "categorias"} neste mês.
        </Text>
        <Footer data={data} />
      </Page>

      {/* ── P2 · ENTREGAS POR CATEGORIA ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 2" title="Entregas por categoria" />
        <Text style={s.sectionLead}>
          Cada categoria reúne os materiais entregues no período, com a data de entrega.
        </Text>
        {data.groups.length === 0
          ? <Text style={{ fontSize: 9, color: FAINT }}>Nenhuma entrega registrada neste período.</Text>
          : data.groups.map((g) => <CategoryGroup key={g.type} group={g} />)}
        <Footer data={data} />
      </Page>
    </Document>
  );
}

export function buildDeliverablesReport(data: DeliverablesReportData) {
  return <DeliverablesReportDocument data={data} />;
}
