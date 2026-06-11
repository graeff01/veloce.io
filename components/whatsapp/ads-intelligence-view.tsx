"use client";

import { useEffect, useState } from "react";
import { Loader2, Megaphone, Sparkles, TrendingUp } from "lucide-react";

interface AdRow {
  adId: string; name: string; campaignName: string; status: string;
  investimento: number; leads: number; atendidos: number; negociacoes: number;
  conversoes: number; cpl: number | null; taxaConversao: number;
  resultado: "destaque" | "saudavel" | "atencao" | "desperdicio";
}
interface CampaignRow {
  campaignId: string; name: string; status: string;
  investimento: number; leads: number; conversoes: number; cpl: number | null; taxaConversao: number;
}
interface Data {
  hasMeta: boolean; hasAdData: boolean;
  cards: { oportunidades: number; investimento: number; cplReal: number | null; conversoes: number; taxaConversao: number };
  funil: { impressoes: number; cliques: number; leads: number; atendidos: number; negociacoes: number; conversoes: number };
  campanhas: CampaignRow[];
  anuncios: AdRow[];
  qualidade: { excelente: number; boa: number; media: number; baixa: number };
  insights: string[];
}

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const fmtBRL = (v: number, d = 0) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const pctTxt = (n: number) => `${Math.round(n * 100)}%`;

const RESULTADO: Record<AdRow["resultado"], { label: string; color: string; soft: string }> = {
  destaque:    { label: "Destaque",    color: "#16A34A", soft: "var(--green-soft)" },
  saudavel:    { label: "Saudável",    color: "var(--accent)", soft: "var(--accent-soft)" },
  atencao:     { label: "Atenção",     color: "#D97706", soft: "var(--amber-soft)" },
  desperdicio: { label: "Desperdício", color: "#DC2626", soft: "var(--red-soft)" },
};

export function AdsIntelligenceView({ clientId, year, month }: { clientId: string; year: number; month: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/ads-intelligence?year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => setData(d))
      .finally(() => setLoading(false));
  }, [clientId, year, month]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );
  if (!data) return null;

  if (!data.hasMeta) return <Notice title="Conecte a conta Meta Ads" text="A Ads Intelligence cruza o investimento da Meta com o comportamento real do lead no WhatsApp. Conecte a conta de anúncios na aba Anúncios para começar." />;
  if (!data.hasAdData) return <Notice title="Aguardando sincronização" text="Nenhum dado de anúncio no período. Clique em “Sincronizar agora” na aba Anúncios para puxar a estrutura e o investimento da Meta." />;

  const c = data.cards;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Cards principais ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Card label="Oportunidades" value={String(c.oportunidades)} sub="leads reais de anúncio" accent="var(--accent)" />
        <Card label="Investimento" value={c.investimento > 0 ? fmtBRL(c.investimento) : "—"} sub="consumido na Meta" accent="#0EA5E9" />
        <Card label="CPL real" value={c.cplReal != null ? fmtBRL(c.cplReal, 2) : "—"} sub="investimento ÷ oportunidades" accent="#8B5CF6" />
        <Card label="Conversões" value={String(c.conversoes)} sub="leads convertidos" accent="#16A34A" />
        <Card label="Taxa de conversão" value={pctTxt(c.taxaConversao)} sub="conversões ÷ oportunidades" accent="#D97706" />
      </div>

      {/* ── Insights automáticos ── */}
      {data.insights.length > 0 && (
        <Panel>
          <Label icon={<Sparkles size={13} color="var(--accent)" />}>Insights automáticos</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
            {data.insights.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 6, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── Funil real ── */}
      <Panel>
        <Label icon={<TrendingUp size={13} color="var(--accent)" />}>Funil real — do anúncio à conversão</Label>
        <Funnel funil={data.funil} />
      </Panel>

      {/* ── Top Campanhas ── */}
      <Panel>
        <Label icon={<Megaphone size={13} color="var(--accent)" />}>Top campanhas</Label>
        <Table
          cols={["Campanha", "Investimento", "Leads", "CPL", "Conversões", "Taxa"]}
          widths="1.6fr 1fr 70px 90px 90px 70px"
          rows={data.campanhas.slice(0, 8).map((c) => [
            <Name key="n" name={c.name} status={c.status} />,
            c.investimento > 0 ? fmtBRL(c.investimento) : "—",
            String(c.leads),
            c.cpl != null ? fmtBRL(c.cpl, 2) : "—",
            String(c.conversoes),
            pctTxt(c.taxaConversao),
          ])}
        />
      </Panel>

      {/* ── Top Anúncios ── */}
      <Panel>
        <Label icon={<Megaphone size={13} color="var(--accent)" />}>Top anúncios</Label>
        <Table
          cols={["Anúncio", "Investimento", "Leads", "CPL", "Conversões", "Resultado"]}
          widths="1.6fr 1fr 70px 90px 90px 110px"
          rows={data.anuncios.slice(0, 12).map((a) => [
            <Name key="n" name={a.name} status={a.status} />,
            a.investimento > 0 ? fmtBRL(a.investimento) : "—",
            String(a.leads),
            a.cpl != null ? fmtBRL(a.cpl, 2) : "—",
            String(a.conversoes),
            <Badge key="r" r={a.resultado} />,
          ])}
        />
      </Panel>

      {/* ── Qualidade dos leads ── */}
      <Panel>
        <Label>Qualidade dos leads</Label>
        <Quality q={data.qualidade} />
      </Panel>
    </div>
  );
}

/* ──────────── componentes ──────────── */
function Card({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
      <p style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", margin: 0 }}>{label}</p>
      <p style={{ ...num, fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: "8px 0 4px" }}>{value}</p>
      <p style={{ fontSize: 11, color: accent, margin: 0 }}>{sub}</p>
    </div>
  );
}
function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-card)" }}>{children}</div>;
}
function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</span>
    </div>
  );
}
function Name({ name, status }: { name: string; status: string }) {
  const active = status === "ACTIVE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "#16A34A" : status === "PAUSED" ? "#D97706" : "var(--text-muted)", flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
    </div>
  );
}
function Badge({ r }: { r: AdRow["resultado"] }) {
  const x = RESULTADO[r];
  return <span style={{ fontSize: 11, fontWeight: 700, color: x.color, background: x.soft, padding: "3px 10px", borderRadius: 20 }}>{x.label}</span>;
}
function Table({ cols, widths, rows }: { cols: string[]; widths: string; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "16px 4px" }}>Sem dados no período.</p>;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: widths, padding: "0 4px 8px", borderBottom: "1px solid var(--border)" }}>
        {cols.map((c, i) => (
          <span key={c} style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: i === 0 ? "left" : "right" }}>{c}</span>
        ))}
      </div>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: widths, padding: "11px 4px", borderBottom: ri < rows.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", gap: 8 }}>
          {r.map((cell, ci) => (
            <div key={ci} style={{ ...num, fontSize: 13, color: ci === 0 ? "var(--text-primary)" : "var(--text-secondary)", textAlign: ci === 0 ? "left" : "right", display: "flex", justifyContent: ci === 0 ? "flex-start" : "flex-end", overflow: "hidden" }}>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
function Funnel({ funil }: { funil: Data["funil"] }) {
  const steps = [
    { label: "Impressões", value: funil.impressoes },
    { label: "Cliques", value: funil.cliques },
    { label: "Oportunidades", value: funil.leads },
    { label: "Atendidos", value: funil.atendidos },
    { label: "Negociações", value: funil.negociacoes },
    { label: "Conversões", value: funil.conversoes },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 110px", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{s.label}</span>
            <div style={{ height: 22, borderRadius: 6, background: "var(--bg-elevated)", overflow: "hidden" }}>
              <div style={{ width: `${Math.max((s.value / max) * 100, 1)}%`, height: "100%", background: "color-mix(in srgb, var(--accent) 78%, transparent)", borderRadius: 6 }} />
            </div>
            <span style={{ ...num, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>
              {s.value.toLocaleString("pt-BR")}
              {conv != null && <span style={{ fontSize: 11, fontWeight: 500, color: conv < 40 ? "#D97706" : "var(--text-muted)", marginLeft: 6 }}>{conv}%</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function Quality({ q }: { q: Data["qualidade"] }) {
  const total = q.excelente + q.boa + q.media + q.baixa;
  const rows = [
    { label: "Excelente", value: q.excelente, color: "#16A34A" },
    { label: "Boa", value: q.boa, color: "var(--accent)" },
    { label: "Média", value: q.media, color: "#D97706" },
    { label: "Baixa", value: q.baixa, color: "#DC2626" },
  ];
  if (total === 0) return <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>Sem leads de anúncio no período.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{r.label}</span>
          <div style={{ height: 10, borderRadius: 5, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ width: `${(r.value / total) * 100}%`, height: "100%", background: r.color, borderRadius: 5 }} />
          </div>
          <span style={{ ...num, fontSize: 12.5, color: "var(--text-secondary)", textAlign: "right" }}>{r.value} · {Math.round((r.value / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "40px 32px", textAlign: "center", boxShadow: "var(--shadow-card)" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <Megaphone size={20} color="var(--accent)" />
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>{title}</p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}
