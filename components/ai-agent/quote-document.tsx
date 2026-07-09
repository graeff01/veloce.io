import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// ── Documento de orçamento (F2) ──────────────────────────────────────────────
// Template neutro e limpo. A fidelidade ao layout específico de cada cliente é
// configuração/design posterior — a estrutura (itens, subtotal, taxas, total) é fixa.

export interface QuoteDocLine { label: string; qty: number; unit: number; amount: number }
export interface QuoteDocData {
  clientName: string;
  number: number;
  contactName: string | null;
  items: QuoteDocLine[];
  subtotal: number;
  fees: number;
  total: number;
  currency: string;
  summary?: string | null;
  generatedAt: string;
}

const ACCENT = "#0F766E";
const INK = "#111827";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const SOFT = "#F0FDFA";

const brl = (v: number, currency: string) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { fontSize: 17, fontFamily: "Helvetica-Bold", color: INK },
  tag: { fontSize: 8, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 16 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  metaLabel: { color: MUTED },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 10 },
  summary: { backgroundColor: SOFT, borderRadius: 6, padding: 10, color: INK, marginBottom: 16, fontSize: 9.5 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: ACCENT, paddingBottom: 5, marginBottom: 2 },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: LINE },
  cLabel: { flex: 1 },
  cQty: { width: 40, textAlign: "right" },
  cUnit: { width: 80, textAlign: "right" },
  cAmount: { width: 90, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: ACCENT },
  grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  grandValue: { fontFamily: "Helvetica-Bold", fontSize: 12, color: ACCENT },
  foot: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: MUTED, textAlign: "center", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
});

export function buildQuoteDoc(d: QuoteDocData) {
  const cur = d.currency || "BRL";
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>{d.clientName}</Text>
          <View>
            <Text style={s.tag}>Orçamento</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" }}>Nº {d.number}</Text>
          </View>
        </View>
        <View style={s.rule} />

        <View style={s.metaRow}><Text style={s.metaLabel}>Cliente</Text><Text>{d.contactName ?? "—"}</Text></View>
        <View style={s.metaRow}><Text style={s.metaLabel}>Data</Text><Text>{d.generatedAt}</Text></View>

        <Text style={s.title}>Detalhamento</Text>
        {d.summary ? <Text style={s.summary}>{d.summary}</Text> : null}

        <View style={s.th}>
          <Text style={[s.thText, s.cLabel]}>Item</Text>
          <Text style={[s.thText, s.cQty]}>Qtd</Text>
          <Text style={[s.thText, s.cUnit]}>Unit.</Text>
          <Text style={[s.thText, s.cAmount]}>Valor</Text>
        </View>
        {d.items.map((it, i) => (
          <View key={i} style={s.row}>
            <Text style={s.cLabel}>{it.label}</Text>
            <Text style={s.cQty}>{it.qty}</Text>
            <Text style={s.cUnit}>{brl(it.unit, cur)}</Text>
            <Text style={s.cAmount}>{brl(it.amount, cur)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}><Text style={{ color: MUTED }}>Subtotal</Text><Text>{brl(d.subtotal, cur)}</Text></View>
          <View style={s.totalRow}><Text style={{ color: MUTED }}>Taxas</Text><Text>{brl(d.fees, cur)}</Text></View>
          <View style={s.grand}><Text style={s.grandLabel}>Total</Text><Text style={s.grandValue}>{brl(d.total, cur)}</Text></View>
        </View>

        <Text style={s.foot}>Orçamento gerado automaticamente · sujeito a confirmação de um atendente · valores em {cur}.</Text>
      </Page>
    </Document>
  );
}
