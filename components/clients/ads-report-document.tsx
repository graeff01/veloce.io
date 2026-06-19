import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { VELOCE_CONTACT } from "@/lib/brand";
import "@/lib/pdf-fonts";

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
const SOFT = "#F8FAFC";       // fundo sutil dos cards de KPI
const CAMPBG = "#E7ECF3";     // faixa da campanha — mais em evidência que o anúncio
const POS = "#067647";        // verde discreto (leads reais)
const ACCENT = "#4F46E5";     // acento de marca (indigo Veloce.io)

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10, color: INK, fontFamily: "Helvetica", backgroundColor: BG },

  // Cabeçalho corrente
  runningHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  runningBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 0.3 },
  runningMeta: { fontSize: 8, color: FAINT },

  // Capa
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

  // Intro da seção (orienta o cliente)
  sectionLead: { fontSize: 9.5, color: MUTED, lineHeight: 1.5, marginBottom: 16 },

  // Tabela hierárquica: campanha (destaque) → anúncios (indentados), alinhados nas mesmas colunas
  grpHead: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1.2, borderBottomColor: INK },
  grpTh: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },

  // Cada campanha (+ seus anúncios) num card próprio → blocos separados quando há várias
  group: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 8, overflow: "hidden", backgroundColor: BG },
  campRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: CAMPBG, borderBottomWidth: 1, borderBottomColor: LINE },
  campName: { fontSize: 10.5, color: INK, fontFamily: "Helvetica-Bold" },
  campStatus: { fontSize: 7.5, color: MUTED, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  campM: { fontSize: 9.5, color: INK, fontFamily: "Helvetica-Bold" },
  campMPos: { fontSize: 9.5, color: POS, fontFamily: "Helvetica-Bold" },

  adRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: LINE },
  adName: { fontSize: 9, color: INK2, paddingLeft: 14 },
  adM: { fontSize: 8.5, color: INK2 },
  adMPos: { fontSize: 8.5, color: POS, fontFamily: "Helvetica-Bold" },
  adEmpty: { fontSize: 8.5, color: FAINT, paddingVertical: 7, paddingLeft: 22 },

  // Colunas (idênticas para campanha e anúncio → alinhamento perfeito)
  gName: { width: "40%" },
  gM: { width: "15%", textAlign: "right" },

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
      <Text style={s.footerText}>Dados: Meta Ads + WhatsApp · Veloce.io</Text>
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

function KpiCell({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <View style={s.kpiCell}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={positive ? s.kpiValuePos : s.kpiValue}>{value}</Text>
    </View>
  );
}

function GroupHead() {
  return (
    <View style={s.grpHead}>
      <Text style={[s.grpTh, s.gName]}>Campanha / anúncio</Text>
      <Text style={[s.grpTh, s.gM]}>Investim.</Text>
      <Text style={[s.grpTh, s.gM]}>CTR</Text>
      <Text style={[s.grpTh, s.gM]}>Leads</Text>
      <Text style={[s.grpTh, s.gM]}>CPL real</Text>
    </View>
  );
}

function CampaignGroup({ camp, ads }: { camp: AdsReportRow; ads: AdsReportRow[] }) {
  const status = statusLabel(camp.status);
  return (
    <View style={s.group}>
      {/* Linha da campanha — destaque (o "pai") */}
      <View style={s.campRow} wrap={false}>
        <View style={s.gName}>
          <Text style={s.campName}>{camp.name}</Text>
          {status ? <Text style={s.campStatus}>{status}</Text> : null}
        </View>
        <Text style={[s.campM, s.gM]}>{brl(camp.spend)}</Text>
        <Text style={[s.campM, s.gM]}>{pct(camp.ctr)}</Text>
        <Text style={[s.campMPos, s.gM]}>{num(camp.leads)}</Text>
        <Text style={[s.campM, s.gM]}>{camp.cpl != null ? brl(camp.cpl) : "—"}</Text>
      </View>
      {/* Anúncios derivados — indentados */}
      {ads.length === 0
        ? <Text style={s.adEmpty}>Sem anúncios individuais com dados neste período.</Text>
        : ads.map((a, i) => (
            <View key={i} style={[s.adRow, i === ads.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              <View style={s.gName}>
                <Text style={s.adName}><Text style={{ color: FAINT }}>—  </Text>{a.name}</Text>
              </View>
              <Text style={[s.adM, s.gM]}>{brl(a.spend)}</Text>
              <Text style={[s.adM, s.gM]}>{pct(a.ctr)}</Text>
              <Text style={[s.adMPos, s.gM]}>{num(a.leads)}</Text>
              <Text style={[s.adM, s.gM]}>{a.cpl != null ? brl(a.cpl) : "—"}</Text>
            </View>
          ))}
    </View>
  );
}

// Soma anúncios "órfãos" (sem campanha vinculada) num grupo só, por segurança.
function aggregate(rows: AdsReportRow[]): AdsReportRow {
  const spend = rows.reduce((s, a) => s + a.spend, 0);
  const impressions = rows.reduce((s, a) => s + a.impressions, 0);
  const clicks = rows.reduce((s, a) => s + a.clicks, 0);
  const leads = rows.reduce((s, a) => s + a.leads, 0);
  return {
    name: "Outros anúncios", sub: null, status: "",
    spend, impressions, clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    leads, cpl: leads > 0 ? spend / leads : null,
  };
}

function AdsReportDocument({ data }: { data: AdsReportData }) {
  const t = data.totals;

  // Agrupa anúncios sob sua campanha (casa por nome — ad.sub === campaign.name)
  const adsByCamp = new Map<string, AdsReportRow[]>();
  for (const a of data.ads) {
    const key = a.sub ?? "";
    if (!adsByCamp.has(key)) adsByCamp.set(key, []);
    adsByCamp.get(key)!.push(a);
  }
  const campNames = new Set(data.campaigns.map((c) => c.name));
  const orphanAds = data.ads.filter((a) => !campNames.has(a.sub ?? ""));

  return (
    <Document title={`Relatório de Anúncios — ${data.clientName}`} author="Veloce.io">
      {/* ── CAPA ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Relatório de Anúncios</Text>
          <Text style={s.coverClient}>{data.clientName}</Text>
          <Text style={s.coverTitle}>Performance de Anúncios</Text>
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

      {/* ── P2 · DESEMPENHO (campanha em destaque → anúncios derivados abaixo) ── */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 2" title="Desempenho dos anúncios" />
        <Text style={s.sectionLead}>
          Cada campanha aparece em destaque com o resultado consolidado e, logo abaixo, os anúncios que pertencem a ela.
        </Text>
        <GroupHead />
        {data.campaigns.length === 0 && orphanAds.length === 0
          ? <Text style={s.adEmpty}>Sem campanhas com dados neste período.</Text>
          : data.campaigns.map((c) => (
              <CampaignGroup key={c.name} camp={c} ads={adsByCamp.get(c.name) ?? []} />
            ))}
        {orphanAds.length > 0 && <CampaignGroup camp={aggregate(orphanAds)} ads={orphanAds} />}
        <Footer data={data} />
      </Page>

      {/* ── FECHAMENTO ── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Fale com a gente</Text>
          <Text style={s.coverClient}>Obrigado.</Text>
          <Text style={s.coverTitle}>{"Seguimos otimizando suas campanhas.\nQualquer dúvida, é só chamar..."}</Text>
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

export function buildAdsReport(data: AdsReportData) {
  return <AdsReportDocument data={data} />;
}
