import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// ── Documento de orçamento (F2) ──────────────────────────────────────────────
// Layout de orçamento comercial dirigido por dados (logo + contatos + tabela +
// observações). Tudo vem de QuoteDocData — sem hardcode de cliente. Os dados de
// apresentação (company/observações/validade) moram em PricingConfig.rules.

export interface QuoteDocLine { code?: string | null; label: string; qty: number; unit: number; amount: number }
export interface QuoteCompany {
  name: string;
  logoUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  cep?: string | null;
  email?: string | null;
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
}
export interface QuoteDocData {
  company: QuoteCompany;
  number: number;
  contactName: string | null;
  contactCity?: string | null;
  sellerName?: string | null;
  items: QuoteDocLine[];
  total: number;
  currency: string;
  observacoes?: string | null;
  generatedAt: string;      // "Criado em"
  validUntil?: string | null; // "Válido até"
}

const INK = "#111827";
const MUTED = "#6B7280";
const LINE = "#D1D5DB";
const DARK = "#1A1A1A";

const brl = (v: number, currency: string) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 44, paddingHorizontal: 28, fontSize: 9, color: INK, fontFamily: "Helvetica" },

  // Cabeçalho: logo | contatos | caixa de meta
  header: { flexDirection: "row", borderWidth: 1, borderColor: INK },
  hLogo: { width: 132, borderRightWidth: 1, borderRightColor: INK, alignItems: "center", justifyContent: "center", padding: 6 },
  logo: { width: 118 },
  hContacts: { flex: 1, padding: 6, alignItems: "center", justifyContent: "center", textAlign: "center" },
  contactStrong: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 1 },
  contactLine: { fontSize: 7.5, color: INK, marginBottom: 1 },
  hMeta: { width: 118, borderLeftWidth: 1, borderLeftColor: INK },
  metaCell: { paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: INK, alignItems: "center" },
  metaLabel: { fontSize: 7, color: MUTED },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  title: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 10, marginBottom: 8 },

  // Blocos de cliente/vendedor/endereço
  fieldRow: { flexDirection: "row", borderWidth: 1, borderColor: INK, borderTopWidth: 0 },
  fieldRowTop: { flexDirection: "row", borderWidth: 1, borderColor: INK },
  cell: { flex: 1, padding: 4, borderRightWidth: 1, borderRightColor: INK },
  cellLast: { flex: 1, padding: 4 },
  fLabel: { fontSize: 7, color: MUTED, marginBottom: 1 },
  fValue: { fontSize: 9, minHeight: 10 },

  // Tabela
  thead: { flexDirection: "row", backgroundColor: DARK, marginTop: 12 },
  th: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 5, paddingHorizontal: 5 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  td: { paddingVertical: 5, paddingHorizontal: 5, fontSize: 8.5 },
  cCode: { width: 62 },
  cDesc: { flex: 1 },
  cQty: { width: 46, textAlign: "center" },
  cUnit: { width: 78, textAlign: "right" },
  cTotal: { width: 82, textAlign: "right" },

  totalWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totalBox: { flexDirection: "row", borderWidth: 1, borderColor: INK },
  totalLabel: { paddingVertical: 6, paddingHorizontal: 14, fontFamily: "Helvetica-Bold", fontSize: 10, borderRightWidth: 1, borderRightColor: INK },
  totalValue: { paddingVertical: 6, paddingHorizontal: 14, fontFamily: "Helvetica-Bold", fontSize: 11, width: 110, textAlign: "right" },

  obsBar: { backgroundColor: DARK, color: "#fff", fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 3, paddingHorizontal: 6, marginTop: 16 },
  obsBox: { borderWidth: 1, borderColor: INK, borderTopWidth: 0, padding: 8, minHeight: 42, fontSize: 9 },

  foot: { position: "absolute", bottom: 22, left: 28, right: 28, fontSize: 7.5, color: MUTED, textAlign: "right" },
});

function Cell({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={last ? s.cellLast : s.cell}>
      <Text style={s.fLabel}>{label}</Text>
      <Text style={s.fValue}>{value || " "}</Text>
    </View>
  );
}

export function buildQuoteDoc(d: QuoteDocData) {
  const cur = d.currency || "BRL";
  const co = d.company;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Cabeçalho */}
        <View style={s.header}>
          <View style={s.hLogo}>
            {co.logoUrl ? <Image src={co.logoUrl} style={s.logo} /> : <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{co.name}</Text>}
          </View>
          <View style={s.hContacts}>
            {co.phone ? <Text style={s.contactStrong}>Tel.: {co.phone}</Text> : null}
            {co.whatsapp ? <Text style={s.contactStrong}>WhatsApp: {co.whatsapp}</Text> : null}
            {co.address ? <Text style={s.contactLine}>{co.address}</Text> : null}
            {(co.city || co.cep) ? <Text style={s.contactLine}>{[co.city, co.cep ? `CEP ${co.cep}` : null].filter(Boolean).join(" · ")}</Text> : null}
            {co.facebook ? <Text style={s.contactLine}>Facebook: {co.facebook}</Text> : null}
            {co.instagram ? <Text style={s.contactLine}>Instagram: {co.instagram}</Text> : null}
            {co.email ? <Text style={s.contactLine}>{co.email}</Text> : null}
            {co.website ? <Text style={s.contactLine}>{co.website}</Text> : null}
          </View>
          <View style={s.hMeta}>
            <View style={s.metaCell}><Text style={s.metaLabel}>Criado em</Text><Text style={s.metaValue}>{d.generatedAt}</Text></View>
            <View style={s.metaCell}><Text style={s.metaLabel}>Válido até</Text><Text style={s.metaValue}>{d.validUntil || "—"}</Text></View>
            <View style={[s.metaCell, { borderBottomWidth: 0 }]}><Text style={s.metaLabel}>Orçamento nº</Text><Text style={s.metaValue}>{d.number}</Text></View>
          </View>
        </View>

        <Text style={s.title}>Orçamento</Text>

        {/* Cliente / Vendedor */}
        <View style={s.fieldRowTop}>
          <Cell label="Cliente" value={d.contactName} />
          <Cell label="Vendedor" value={d.sellerName} last />
        </View>
        <View style={s.fieldRow}>
          <Cell label="Telefone" value={null} />
          <Cell label="Celular" value={null} />
          <Cell label="E-mail" value={null} last />
        </View>
        <View style={s.fieldRow}>
          <Cell label="Endereço" value={null} />
          <Cell label="Bairro" value={null} last />
        </View>
        <View style={s.fieldRow}>
          <Cell label="Cidade" value={d.contactCity} />
          <Cell label="Estado" value={null} />
          <Cell label="CEP" value={null} last />
        </View>

        {/* Itens */}
        <View style={s.thead}>
          <Text style={[s.th, s.cCode]}>CÓDIGO</Text>
          <Text style={[s.th, s.cDesc]}>DESCRIÇÃO</Text>
          <Text style={[s.th, s.cQty]}>QTD</Text>
          <Text style={[s.th, s.cUnit]}>PREÇO UNIT.</Text>
          <Text style={[s.th, s.cTotal]}>TOTAL</Text>
        </View>
        {d.items.map((it, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={[s.td, s.cCode]}>{it.code || ""}</Text>
            <Text style={[s.td, s.cDesc]}>{it.label}</Text>
            <Text style={[s.td, s.cQty]}>{it.qty} UN</Text>
            <Text style={[s.td, s.cUnit]}>{brl(it.unit, cur)}</Text>
            <Text style={[s.td, s.cTotal]}>{brl(it.amount, cur)}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={s.totalWrap}>
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{brl(d.total, cur)}</Text>
          </View>
        </View>

        {/* Observações */}
        <Text style={s.obsBar}>Observações:</Text>
        <Text style={s.obsBox}>{d.observacoes || "Orçamento sujeito a confirmação de um atendente."}</Text>

        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}
