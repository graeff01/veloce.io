import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { VELOCE_CONTACT } from "@/lib/brand";
import "@/lib/pdf-fonts";

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface DiagModelRow {
  name: string;            // "Renegade"
  campaignLabel: string;   // status/objetivo curto
  spend: number;
  leads: number;
  cpl: number | null;
  ctr: number;
  ranking: "acima" | "media" | "abaixo" | "na"; // ranking de conversão do anúncio ativo
  responseMedianSec: number | null;
  semResposta: number;
  conversas: number;
}
export interface DiagData {
  clientName: string;
  accountName: string | null;
  periodLabel: string;
  generatedAt: string;
  totals: { spend: number; leads: number; cpl: number | null; vendas: number; visitas: number; semResposta: number; semRespostaPct: number; conversas: number };
  models: DiagModelRow[];
  responseBuckets: { upTo5min: number; upTo1h: number; upTo12h: number; over12h: number; semResposta: number };
  responseTotal: number;
  funnel: { recebidos: number; atendidos: number; qualificados: number; negociacao: number; visitas: number; vendas: number };
  verdict: string;
  highlights: string[];
  attention: string[];
  actionsImediato: string[];
  actionsCurto: string[];
}

// ── Paleta corporativa (mesma do Executivo/Anúncios) ─────────────────────────
const INK = "#0F172A";
const INK2 = "#1E293B";
const MUTED = "#64748B";
const FAINT = "#94A3B8";
const LINE = "#E2E8F0";
const BG = "#FFFFFF";
const SOFT = "#F8FAFC";
const POS = "#067647";
const NEG = "#B42318";
const BAR = "#0F172A";
const BARBG = "#EEF2F6";
const ACCENT = "#4F46E5";
const CALLBG = "#0F172A";

// ── Formatação ───────────────────────────────────────────────────────────────
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
function dur(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}min`;
  const h = sec / 3600;
  return `${h.toFixed(1)}h`;
}
const rankLabel = (r: DiagModelRow["ranking"]) => ({ acima: "Acima da média", media: "Na média", abaixo: "Abaixo da média", na: "—" }[r]);
const rankColor = (r: DiagModelRow["ranking"]) => ({ acima: POS, media: INK2, abaixo: NEG, na: FAINT }[r]);

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

  paragraph: { fontSize: 11, color: INK2, lineHeight: 1.6, marginBottom: 14 },

  // Callout (caixa de destaque com o veredito) — inspirado nas caixas dos docs-mestre
  callout: { backgroundColor: CALLBG, borderRadius: 10, padding: 18, marginBottom: 18 },
  calloutLabel: { fontSize: 8, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 },
  calloutText: { fontSize: 12.5, color: "#FFFFFF", lineHeight: 1.5, fontFamily: "Helvetica-Bold" },

  listBlock: { marginTop: 4, marginBottom: 6 },
  listLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  listItem: { flexDirection: "row", marginBottom: 6, paddingRight: 10 },
  listDot: { fontSize: 10, width: 14 },
  listText: { fontSize: 10, color: INK2, lineHeight: 1.45, flex: 1 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 4 },
  kpiCell: { width: "31.5%", marginBottom: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: SOFT, borderWidth: 1, borderColor: LINE, borderRadius: 8 },
  kpiLabel: { fontSize: 8.5, color: MUTED, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 21, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.5 },

  note: { fontSize: 8, color: FAINT, marginTop: 14, lineHeight: 1.5 },
  sectionLead: { fontSize: 9.5, color: MUTED, lineHeight: 1.5, marginBottom: 14 },

  // Tabela de modelos
  th: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1.2, borderBottomColor: INK },
  thText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 },
  tr: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: "center" },
  cName: { width: "26%" },
  cNum: { width: "12.33%", textAlign: "right" },
  modelName: { fontSize: 10, color: INK, fontFamily: "Helvetica-Bold" },
  modelSub: { fontSize: 7, color: FAINT, marginTop: 2 },
  cellInk: { fontSize: 9.5, color: INK2 },
  cellBold: { fontSize: 9.5, color: INK, fontFamily: "Helvetica-Bold" },

  // Barras
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  barLabel: { fontSize: 8.5, color: MUTED, width: 92 },
  barTrack: { flex: 1, height: 10, backgroundColor: BARBG, borderRadius: 2, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 2 },
  barValue: { fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold", width: 64, textAlign: "right" },

  gargalo: { marginBottom: 16, borderLeftWidth: 3, borderLeftColor: NEG, paddingLeft: 12 },
  gargaloTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 4 },
  gargaloText: { fontSize: 9.5, color: INK2, lineHeight: 1.5 },

  // Funil
  funnelStep: { marginBottom: 10 },
  funnelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  funnelName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK },
  funnelMeta: { fontSize: 8.5, color: MUTED },
  funnelTrack: { height: 22, backgroundColor: BARBG, borderRadius: 3, overflow: "hidden" },
  funnelFill: { height: 22, borderRadius: 3, justifyContent: "center", paddingLeft: 9 },
  funnelFillText: { fontSize: 9, color: "#FFFFFF", fontFamily: "Helvetica-Bold" },

  footer: { position: "absolute", bottom: 30, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: FAINT },
});

function MetaRow({ label, value }: { label: string; value: string }) {
  return <View style={s.metaRow}><Text style={s.metaLabel}>{label}</Text><Text style={s.metaValue}>{value}</Text></View>;
}
function RunningHead({ data }: { data: DiagData }) {
  return <View style={s.runningHead} fixed><Text style={s.runningBrand}>{data.clientName}</Text><Text style={s.runningMeta}>Diagnóstico de Funil & Atendimento · {data.periodLabel}</Text></View>;
}
function Footer() {
  return <View style={s.footer} fixed><Text style={s.footerText}>Dados: Meta Ads + WhatsApp · Veloce.io</Text><Text style={s.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} /><Text style={s.footerText}>Veloce.io</Text></View>;
}
function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return <View><Text style={s.sectionKicker}>{kicker}</Text><Text style={s.sectionTitle}>{title}</Text></View>;
}
function KpiCell({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return <View style={s.kpiCell}><Text style={s.kpiLabel}>{label}</Text><Text style={[s.kpiValue, tone === "pos" ? { color: POS } : tone === "neg" ? { color: NEG } : {}]}>{value}</Text></View>;
}
function Bar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  return <View style={s.barRow}><Text style={s.barLabel}>{label}</Text><View style={s.barTrack}><View style={[s.barFill, { width: `${w}%`, backgroundColor: color }]} /></View><Text style={s.barValue}>{count}</Text></View>;
}
function FunnelStep({ name, count, base, prev, color }: { name: string; count: number; base: number; prev: number | null; color: string }) {
  const w = base > 0 ? Math.max(3, (count / base) * 100) : 0;
  const adv = prev != null && prev > 0 ? Math.round((count / prev) * 100) : null;
  return (
    <View style={s.funnelStep}>
      <View style={s.funnelHead}>
        <Text style={s.funnelName}>{name}</Text>
        <Text style={s.funnelMeta}>{num(count)}{base > 0 ? `  ·  ${Math.round((count / base) * 100)}% do total` : ""}{adv != null ? `  ·  ${adv}% da etapa anterior` : ""}</Text>
      </View>
      <View style={s.funnelTrack}><View style={[s.funnelFill, { width: `${w}%`, backgroundColor: color }]}>{w > 16 ? <Text style={s.funnelFillText}>{num(count)}</Text> : null}</View></View>
    </View>
  );
}

function DiagnosticoReportDocument({ data }: { data: DiagData }) {
  const t = data.totals;
  const maxResp = Math.max(1, data.responseBuckets.upTo5min, data.responseBuckets.upTo1h, data.responseBuckets.upTo12h, data.responseBuckets.over12h, data.responseBuckets.semResposta);
  const maxAband = Math.max(1, ...data.models.map((m) => m.semResposta));

  return (
    <Document title={`Diagnóstico — ${data.clientName}`} author="Veloce.io">
      {/* CAPA */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Diagnóstico Estratégico</Text>
          <Text style={s.coverClient}>{data.clientName}</Text>
          <Text style={s.coverTitle}>{"Diagnóstico de Funil & Atendimento\nPor que os leads chegam e a venda não fecha"}</Text>
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

      {/* P1 · RESUMO EXECUTIVO */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 1" title="Resumo executivo" />
        <View style={s.callout}>
          <Text style={s.calloutLabel}>O veredito em uma frase</Text>
          <Text style={s.calloutText}>{data.verdict}</Text>
        </View>
        <View style={s.listBlock}>
          <Text style={s.listLabel}>O que está funcionando</Text>
          {data.highlights.map((h, i) => <View key={i} style={s.listItem}><Text style={[s.listDot, { color: POS }]}>+</Text><Text style={s.listText}>{h}</Text></View>)}
        </View>
        <View style={s.listBlock}>
          <Text style={s.listLabel}>Onde está o gargalo</Text>
          {data.attention.map((p, i) => <View key={i} style={s.listItem}><Text style={[s.listDot, { color: NEG }]}>!</Text><Text style={s.listText}>{p}</Text></View>)}
        </View>
        <Footer />
      </Page>

      {/* P2 · OS NÚMEROS */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 2" title="Os números do período" />
        <View style={s.kpiGrid}>
          <KpiCell label="Investimento total" value={brl(t.spend)} />
          <KpiCell label="Leads reais (WhatsApp)" value={num(t.leads)} tone="pos" />
          <KpiCell label="CPL real médio" value={t.cpl != null ? brl(t.cpl) : "—"} />
          <KpiCell label="Vendas no período" value={num(t.vendas)} tone="neg" />
          <KpiCell label="Visitas agendadas" value={num(t.visitas)} tone="neg" />
          <KpiCell label="Leads sem resposta" value={`${num(t.semResposta)} (${pct(t.semRespostaPct)})`} tone="neg" />
        </View>
        <Text style={s.note}>
          Leads reais = conversas efetivamente iniciadas no WhatsApp e atribuídas ao anúncio pelo ID oficial da Meta.
          O CPL real usa esse número (não os leads modelados da Meta). Vendas e visitas: nenhuma registrada no período sobre os {num(t.leads)} leads de anúncio.
          Este é o ponto central deste documento: o investimento gera oportunidade; a conversão em venda é o que está travado.
        </Text>
        <Footer />
      </Page>

      {/* P3 · OS ANÚNCIOS ESTÃO ENTREGANDO */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 3" title="Os anúncios estão entregando" />
        <Text style={s.sectionLead}>Desempenho por modelo. Na maioria, o anúncio gera lead bom e barato — a evidência de que a mídia não é o problema principal.</Text>
        <View style={s.th}>
          <Text style={[s.thText, s.cName]}>Modelo</Text>
          <Text style={[s.thText, s.cNum]}>Investido</Text>
          <Text style={[s.thText, s.cNum]}>Leads</Text>
          <Text style={[s.thText, s.cNum]}>CPL real</Text>
          <Text style={[s.thText, s.cNum]}>CTR</Text>
          <Text style={[s.thText, s.cNum]}>Anúncio</Text>
          <Text style={[s.thText, s.cNum]}>Sem resp.</Text>
        </View>
        {data.models.map((m, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <View style={s.cName}><Text style={s.modelName}>{m.name}</Text><Text style={s.modelSub}>{m.campaignLabel}</Text></View>
            <Text style={[s.cellInk, s.cNum]}>{brl(m.spend)}</Text>
            <Text style={[s.cellBold, s.cNum, { color: POS }]}>{num(m.leads)}</Text>
            <Text style={[s.cellInk, s.cNum]}>{m.cpl != null ? brl(m.cpl) : "—"}</Text>
            <Text style={[s.cellInk, s.cNum]}>{pct(m.ctr)}</Text>
            <Text style={[s.cNum, { fontSize: 8, fontFamily: "Helvetica-Bold", color: rankColor(m.ranking) }]}>{rankLabel(m.ranking)}</Text>
            <Text style={[s.cNum, { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: m.semResposta > 0 ? NEG : INK2 }]}>{num(m.semResposta)}/{num(m.conversas)}</Text>
          </View>
        ))}
        <Text style={s.note}>
          “Anúncio” = ranking de conversão da Meta para o criativo ativo (sinal de quão bem o anúncio transforma clique em conversa, comparado aos concorrentes).
          “Sem resp.” = leads que não receberam nenhuma resposta sobre o total de conversas do modelo.
        </Text>
        <Footer />
      </Page>

      {/* P4 · OS GARGALOS */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 4" title="Onde o dinheiro evapora" />

        <View style={s.gargalo}>
          <Text style={s.gargaloTitle}>Gargalo 1 — Velocidade de resposta</Text>
          <Text style={s.gargaloText}>O lead automotivo tem janela quente de 2 a 6 horas. Uma resposta em 5 minutos converte até 4x mais. A distribuição abaixo mostra onde estamos.</Text>
        </View>
        <View style={{ marginBottom: 18 }}>
          <Bar label="Até 5 min" count={data.responseBuckets.upTo5min} max={maxResp} color={POS} />
          <Bar label="5 min – 1h" count={data.responseBuckets.upTo1h} max={maxResp} color={BAR} />
          <Bar label="1h – 12h" count={data.responseBuckets.upTo12h} max={maxResp} color={BAR} />
          <Bar label="Acima de 12h" count={data.responseBuckets.over12h} max={maxResp} color={NEG} />
          <Bar label="Sem resposta" count={data.responseBuckets.semResposta} max={maxResp} color={NEG} />
        </View>

        <View style={s.gargalo}>
          <Text style={s.gargaloTitle}>Gargalo 2 — Leads abandonados</Text>
          <Text style={s.gargaloText}>{`${num(t.semResposta)} de ${num(t.conversas)} conversas (${pct(t.semRespostaPct)}) nunca receberam uma resposta. Leads bem gerados, pagos, perdidos sem entrar no jogo.`}</Text>
        </View>
        <View style={{ marginBottom: 8 }}>
          {data.models.map((m) => <Bar key={m.name} label={m.name} count={m.semResposta} max={maxAband} color={NEG} />)}
        </View>
        <Footer />
      </Page>

      {/* P5 · O FUNIL TRAVADO */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 5" title="Gargalo 3 — O funil para antes da venda" />
        <Text style={s.sectionLead}>A jornada do lead colapsa: muitos chegam, poucos são atendidos a tempo, e o agendamento de visita/proposta — a porta da venda — não acontece.</Text>
        <FunnelStep name="Leads recebidos" count={data.funnel.recebidos} base={data.funnel.recebidos} prev={null} color={BAR} />
        <FunnelStep name="Atendidos (tiveram resposta)" count={data.funnel.atendidos} base={data.funnel.recebidos} prev={data.funnel.recebidos} color={BAR} />
        <FunnelStep name="Qualificados / em negociação" count={data.funnel.qualificados + data.funnel.negociacao} base={data.funnel.recebidos} prev={data.funnel.atendidos} color={BAR} />
        <FunnelStep name="Visitas agendadas" count={data.funnel.visitas} base={data.funnel.recebidos} prev={data.funnel.qualificados + data.funnel.negociacao} color={NEG} />
        <FunnelStep name="Vendas" count={data.funnel.vendas} base={data.funnel.recebidos} prev={data.funnel.visitas} color={NEG} />
        <Text style={s.note}>O percentual “da etapa anterior” indica a taxa de avanço — quanto menor, maior o gargalo naquela passagem. A queda para zero em “visitas” e “vendas” mostra onde o processo comercial precisa de método.</Text>
        <Footer />
      </Page>

      {/* P6 · PLANO DE AÇÃO */}
      <Page size="A4" style={s.page}>
        <RunningHead data={data} />
        <SectionHead kicker="Página 6" title="O que fazer para vender" />
        <View style={s.listBlock}>
          <Text style={s.listLabel}>Imediato — custo zero de mídia</Text>
          {data.actionsImediato.map((a, i) => <View key={i} style={s.listItem}><Text style={[s.listDot, { color: ACCENT }]}>{String(i + 1)}</Text><Text style={s.listText}>{a}</Text></View>)}
        </View>
        <View style={[s.listBlock, { marginTop: 14 }]}>
          <Text style={s.listLabel}>Curto prazo</Text>
          {data.actionsCurto.map((a, i) => <View key={i} style={s.listItem}><Text style={[s.listDot, { color: ACCENT }]}>{String(i + 1)}</Text><Text style={s.listText}>{a}</Text></View>)}
        </View>
        <Footer />
      </Page>

      {/* FECHAMENTO */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverKicker}>Fale com a gente</Text>
          <Text style={s.coverClient}>Vamos destravar.</Text>
          <Text style={s.coverTitle}>{"O lead já chega. Agora é transformar atendimento em venda.\nSeguimos juntos nisso."}</Text>
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

export function buildDiagnosticoReport(data: DiagData) {
  return <DiagnosticoReportDocument data={data} />;
}
