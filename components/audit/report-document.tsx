import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface ReportLead {
  contactName: string | null;
  name: string | null;
  phone: string | null;
  statusName: string | null;
  createdAtKommo: string;
}
export interface ReportGroup { adTag: string; total: number; leads: ReportLead[] }
export interface ReportData {
  clientName: string;
  accountName: string | null;
  periodLabel: string;
  totalLeads: number;
  groups: ReportGroup[];
  generatedAt: string;
}

const ACCENT = "#7C3AED";
const INK = "#1E1B2E";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const SOFT = "#F5F3FF";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK },
  brandDot: { color: ACCENT },
  brandSub: { fontSize: 8, color: MUTED, marginTop: 2 },
  reportTag: { fontSize: 8, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 16 },
  // Title block
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 3 },
  // Summary cards
  summary: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 18 },
  card: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 12, backgroundColor: SOFT },
  cardValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: ACCENT },
  cardLabel: { fontSize: 8, color: MUTED, marginTop: 3 },
  // Ad group
  group: { marginBottom: 14, borderWidth: 1, borderColor: LINE, borderRadius: 6, overflow: "hidden" },
  groupHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: SOFT, paddingVertical: 7, paddingHorizontal: 12 },
  groupName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK },
  groupCount: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#FFFFFF", backgroundColor: ACCENT, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  // Table
  thead: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: LINE },
  td: { fontSize: 8.5, color: INK },
  cName: { width: "30%" }, cPhone: { width: "26%" }, cStatus: { width: "30%" }, cDate: { width: "14%", textAlign: "right" },
  // Footer
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: MUTED },
});

function ReportDocument({ data }: { data: ReportData }) {
  return (
    <Document title={`Auditoria de Leads — ${data.clientName}`} author="veloce.io">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>veloce<Text style={s.brandDot}>.io</Text></Text>
            <Text style={s.brandSub}>Gestão de tráfego e performance</Text>
          </View>
          <Text style={s.reportTag}>Relatório de Auditoria de Leads</Text>
        </View>
        <View style={s.rule} />

        {/* Title */}
        <Text style={s.title}>{data.clientName}</Text>
        <Text style={s.subtitle}>
          Período: {data.periodLabel}
          {data.accountName ? `  ·  Origem: ${data.accountName} (Kommo)` : "  ·  Origem: Kommo CRM"}
        </Text>

        {/* Summary */}
        <View style={s.summary}>
          <View style={s.card}>
            <Text style={s.cardValue}>{data.totalLeads}</Text>
            <Text style={s.cardLabel}>Leads no período</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardValue}>{data.groups.length}</Text>
            <Text style={s.cardLabel}>Anúncios com leads</Text>
          </View>
        </View>

        {/* Groups */}
        {data.groups.map((g, gi) => (
          <View key={gi} style={s.group} wrap={false}>
            <View style={s.groupHead}>
              <Text style={s.groupName}>{g.adTag}</Text>
              <Text style={s.groupCount}>{g.total} lead{g.total !== 1 ? "s" : ""}</Text>
            </View>
            <View style={s.thead}>
              <Text style={[s.th, s.cName]}>Lead</Text>
              <Text style={[s.th, s.cPhone]}>Telefone</Text>
              <Text style={[s.th, s.cStatus]}>Status</Text>
              <Text style={[s.th, s.cDate]}>Entrada</Text>
            </View>
            {g.leads.map((l, li) => (
              <View key={li} style={s.row}>
                <Text style={[s.td, s.cName]}>{l.contactName ?? l.name ?? "—"}</Text>
                <Text style={[s.td, s.cPhone]}>{l.phone ?? "—"}</Text>
                <Text style={[s.td, s.cStatus]}>{l.statusName ?? "—"}</Text>
                <Text style={[s.td, s.cDate]}>
                  {new Date(l.createdAtKommo).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {data.groups.length === 0 && (
          <Text style={{ fontSize: 10, color: MUTED, marginTop: 20 }}>Nenhum lead registrado neste período.</Text>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>veloce.io · Relatório gerado em {data.generatedAt}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function buildReport(data: ReportData) {
  return <ReportDocument data={data} />;
}
