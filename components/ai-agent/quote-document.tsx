import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// ── Documento de orçamento (F2) ──────────────────────────────────────────────
// Template profissional configurável por cliente: cabeçalho com LOGO + dados da
// empresa, itens/subtotal/taxas/total, e blocos de condições (validade, pagamento,
// prazo, garantia, observações). Tudo opcional — some quando não informado, então
// o mesmo template serve do mais simples ao completo. A cor segue a marca (accent).

export interface QuoteDocLine { label: string; qty: number; unit: number; amount: number }
export interface QuoteDocData {
  clientName: string;
  logo?: string | null;          // data URI/URL do logo (opcional)
  accentColor?: string | null;   // cor da marca (hex); default verde-água
  company?: { cnpj?: string | null; address?: string | null; phone?: string | null; site?: string | null } | null;
  number: number;
  contactName: string | null;
  contact?: { phone?: string | null; address?: string | null } | null;
  items: QuoteDocLine[];
  subtotal: number;
  fees: number;
  total: number;
  currency: string;
  summary?: string | null;
  validUntil?: string | null;      // ex.: "20/07/2026"
  paymentTerms?: string | null;    // formas de pagamento / parcelamento
  deliveryTerms?: string | null;   // prazo de entrega e instalação
  warranty?: string | null;        // garantia
  notes?: string | null;           // observações / o que está incluso
  generatedAt: string;
}

const INK = "#111827";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const DEFAULT_ACCENT = "#0F766E";
const softFrom = (hex: string) => `${hex}14`; // ~8% (react-pdf aceita #RRGGBBAA)

const brl = (v: number, currency: string) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });

export function buildQuoteDoc(d: QuoteDocData) {
  const cur = d.currency || "BRL";
  const ACCENT = (d.accentColor && /^#[0-9a-fA-F]{6}$/.test(d.accentColor)) ? d.accentColor : DEFAULT_ACCENT;
  const SOFT = softFrom(ACCENT);

  const s = StyleSheet.create({
    page: { paddingTop: 36, paddingBottom: 60, paddingHorizontal: 40, fontSize: 10, color: INK, fontFamily: "Helvetica" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 340 },
    logo: { width: 46, height: 46, objectFit: "contain", borderRadius: 6 },
    brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK },
    companyLine: { fontSize: 8, color: MUTED, marginTop: 2 },
    tag: { fontSize: 8, color: ACCENT, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" },
    number: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
    rule: { height: 2, backgroundColor: ACCENT, marginTop: 12, marginBottom: 14 },
    metaGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    metaCol: { maxWidth: 250 },
    metaLabel: { color: MUTED, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
    metaValue: { fontSize: 10 },
    title: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 8 },
    summary: { backgroundColor: SOFT, borderRadius: 6, padding: 10, color: INK, marginBottom: 14, fontSize: 9.5, lineHeight: 1.4 },
    th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: ACCENT, paddingBottom: 5, marginBottom: 2 },
    thText: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
    row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: LINE },
    cLabel: { flex: 1 },
    cQty: { width: 40, textAlign: "right" },
    cUnit: { width: 80, textAlign: "right" },
    cAmount: { width: 90, textAlign: "right", fontFamily: "Helvetica-Bold" },
    totals: { marginTop: 14, alignSelf: "flex-end", width: 230 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    grand: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: ACCENT },
    grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 13 },
    grandValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: ACCENT },
    terms: { marginTop: 20 },
    termBlock: { marginBottom: 9 },
    termLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, color: ACCENT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
    termText: { fontSize: 9.5, color: INK, lineHeight: 1.4 },
    foot: { position: "absolute", bottom: 28, left: 40, right: 40, fontSize: 8, color: MUTED, textAlign: "center", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  });

  const companyBits = [d.company?.cnpj && `CNPJ ${d.company.cnpj}`, d.company?.address, d.company?.phone, d.company?.site].filter(Boolean) as string[];
  const contactBits = [d.contact?.phone, d.contact?.address].filter(Boolean) as string[];
  const terms: [string, string | null | undefined][] = [
    ["Condições de pagamento", d.paymentTerms],
    ["Prazo de entrega e instalação", d.deliveryTerms],
    ["Garantia", d.warranty],
    ["Observações", d.notes],
  ];
  const hasTerms = terms.some(([, v]) => v && v.trim());

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Cabeçalho: logo + marca + dados da empresa · nº do orçamento */}
        <View style={s.header}>
          <View style={s.brandRow}>
            {d.logo ? <Image src={d.logo} style={s.logo} /> : null}
            <View>
              <Text style={s.brand}>{d.clientName}</Text>
              {companyBits.map((b, i) => <Text key={i} style={s.companyLine}>{b}</Text>)}
            </View>
          </View>
          <View>
            <Text style={s.tag}>Orçamento</Text>
            <Text style={s.number}>Nº {d.number}</Text>
          </View>
        </View>
        <View style={s.rule} />

        {/* Cliente + Datas */}
        <View style={s.metaGrid}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Cliente</Text>
            <Text style={s.metaValue}>{d.contactName ?? "—"}</Text>
            {contactBits.map((b, i) => <Text key={i} style={[s.companyLine, { marginTop: 1 }]}>{b}</Text>)}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.metaLabel}>Data</Text>
            <Text style={s.metaValue}>{d.generatedAt}</Text>
            {d.validUntil ? <><Text style={[s.metaLabel, { marginTop: 6 }]}>Válido até</Text><Text style={s.metaValue}>{d.validUntil}</Text></> : null}
          </View>
        </View>

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
          <View style={s.totalRow}><Text style={{ color: MUTED }}>Frete e serviços</Text><Text>{brl(d.fees, cur)}</Text></View>
          <View style={s.grand}><Text style={s.grandLabel}>Total</Text><Text style={s.grandValue}>{brl(d.total, cur)}</Text></View>
        </View>

        {/* Condições (validade/pagamento/prazo/garantia/observações) */}
        {hasTerms ? (
          <View style={s.terms}>
            {terms.filter(([, v]) => v && v.trim()).map(([label, v], i) => (
              <View key={i} style={s.termBlock}>
                <Text style={s.termLabel}>{label}</Text>
                <Text style={s.termText}>{v}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.foot}>{d.clientName} · Orçamento gerado automaticamente · sujeito a confirmação · valores em {cur}.</Text>
      </Page>
    </Document>
  );
}
