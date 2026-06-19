import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { VELOCE_CONTACT } from "@/lib/brand";
import "@/lib/pdf-fonts";

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
const ACCENT = "#4F46E5";    // acento de marca (indigo Veloce.io)

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

  // Bloco de metadados (ficha do documento)
  metaBlock: { marginTop: 2 },
  metaRow: { flexDirection: "row", marginBottom: 9 },
  metaLabel: { width: 120, fontSize: 8.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 1 },
  metaValue: { fontSize: 11, color: INK, fontFamily: "Helvetica-Bold", flex: 1 },

  sectionKicker: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  sectionTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3, marginBottom: 20 },
  sectionLead: { fontSize: 9.5, color: MUTED, lineHeight: 1.5, marginBottom: 16 },

  // Hero — duas métricas principais em destaque
  heroRow: { flexDirection: "row", marginTop: 4, marginBottom: 30 },
  heroCell: { flex: 1 },
  heroCellRight: { flex: 1, borderLeftWidth: 1, borderLeftColor: LINE, paddingLeft: 22 },
  heroLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  heroValue: { fontSize: 40, fontFamily: "Helvetica-Bold", color: POS, letterSpacing: -1 },
  heroValueMuted: { fontSize: 40, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -1 },
  heroCaption: { fontSize: 9, color: FAINT, marginTop: 6 },

  // Distribuição por categoria (barras de proporção)
  distLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 11 },
  barLabel: { fontSize: 9, color: INK2, width: 120, flexShrink: 0 },
  barTrack: { flex: 1, height: 10, backgroundColor: "#EEF2F6", borderRadius: 3, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: INK, borderRadius: 3 },
  barValue: { width: 60, textAlign: "right", fontSize: 8.5, color: MUTED, fontFamily: "Helvetica-Bold" },

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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

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
      <Text style={s.footerText}>Entregas do mês · Veloce.io</Text>
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

function Bar({ label, count, max, total }: { label: string; count: number; max: number; total: number }) {
  const w = max > 0 ? Math.max(4, (count / max) * 100) : 0;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={s.barRow} wrap={false}>
      <Text style={s.barLabel}>{label}</Text>
      <View style={s.barTrack}><View style={[s.barFill, { width: `${w}%` }]} /></View>
      <Text style={s.barValue}>{count} · {pct}%</Text>
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
  const maxCount = Math.max(1, ...data.groups.map((g) => g.count));
  return (
    <Document title={`Relatório de Entregas — ${data.clientName}`} author="Veloce.io">
      {/* ── CAPA ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório de Entregas</Text>
          <Text style={s.coverClient}>{data.clientName}</Text>
          <Text style={s.coverTitle}>O que entregamos no mês</Text>
          <View style={s.coverRule} />
          <View style={s.metaBlock}>
            <MetaRow label="Preparado para" value={data.clientName} />
            <MetaRow label="Por" value="Veloce.io" />
            <MetaRow label="Período" value={data.periodLabel} />
            {data.responsavel ? <MetaRow label="Responsável" value={data.responsavel} /> : null}
          </View>
        </View>
        <Text style={s.coverBrandBottom}>veloce.io</Text>
      </Page>

      {/* ── P1 · VISÃO GERAL ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 1" title="Visão geral" />
        <View style={s.heroRow}>
          <View style={s.heroCell}>
            <Text style={s.heroLabel}>Entregas no mês</Text>
            <Text style={s.heroValue}>{data.total}</Text>
            <Text style={s.heroCaption}>concluídas em {data.periodLabel}</Text>
          </View>
          <View style={s.heroCellRight}>
            <Text style={s.heroLabel}>Categorias</Text>
            <Text style={s.heroValueMuted}>{categorias}</Text>
            <Text style={s.heroCaption}>{categorias === 1 ? "tipo de entrega" : "tipos de entrega"}</Text>
          </View>
        </View>

        <Text style={s.distLabel}>Distribuição por categoria</Text>
        {data.groups.length === 0
          ? <Text style={{ fontSize: 9, color: FAINT }}>Nenhuma entrega registrada neste período.</Text>
          : data.groups.map((g) => <Bar key={g.type} label={g.type} count={g.count} max={maxCount} total={data.total} />)}

        <Text style={s.note}>
          Este relatório reúne tudo o que foi efetivamente entregue ao cliente no período — posts, stories, reels,
          campanhas, criativos e demais materiais concluídos. Tarefas internas de organização não entram aqui.
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

      {/* ── FECHAMENTO ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Fale com a gente</Text>
          <Text style={s.coverClient}>Obrigado.</Text>
          <Text style={s.coverTitle}>{"Obrigado pela parceria.\nseguimos com tudo para o próximo mês..."}</Text>
          <View style={s.coverRule} />
          <View style={s.metaBlock}>
            <MetaRow label="WhatsApp" value={VELOCE_CONTACT.whatsapp} />
            <MetaRow label="E-mail" value={VELOCE_CONTACT.email} />
            <MetaRow label="Instagram" value={VELOCE_CONTACT.instagram} />
          </View>
        </View>
        <Text style={s.coverBrandBottom}>veloce.io</Text>
      </Page>
    </Document>
  );
}

export function buildDeliverablesReport(data: DeliverablesReportData) {
  return <DeliverablesReportDocument data={data} />;
}
