"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Users, Megaphone, MessageSquare, Layers, Target, Tag,
  TrendingUp, TrendingDown, BarChart2, CheckCircle2, Send,
  AlertCircle, Inbox, Sparkles, Hash, Clock, Info,
} from "lucide-react";
import { FUNNEL_LABELS } from "@/lib/wa-format";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Overview {
  leads: number; converted: number;
  byOrigin: { ad: number; organic: number };
  byAd: { adTitle: string; total: number; converted: number; conversionRate: number }[];
  series: { date: string; leads: number }[];
  messagesSeries: { date: string; messages: number }[];
  funnel: Record<string, number>;
  messagesReceived: number; avgMessagesPerLead: number; noStage: number;
  campaignsWithLeads: number;
  // Atendimento (coexistência — forward-only)
  storeMessages: number; withReply: number; withoutReply: number;
  responded: number; avgFirstResponseSec: number | null; medianFirstResponseSec: number | null;
  responseMinSec: number | null; responseMaxSec: number | null;
  validLeads: number; invalidLeads: number;
  leadsByTag: { name: string; color: string; count: number }[];
  previous: { leads: number; converted: number };
  cpl: { model: string; realLeads: number; spend: number; cplReal: number | null; metaLeads: number; cplMeta: number | null }[];
  [key: string]: unknown;
}

// Duração curta (sem importar de wa-metrics, que puxa prisma para o client).
function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${m % 60 ? ` ${m % 60}min` : ""}` : `${Math.floor(h / 24)}d`;
}
export interface OpenContact { contactId: string; name: string | null; phone: string | null }

// ─── Utils ────────────────────────────────────────────────────────────────────
function fmtBRL(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function pct(n: number, total: number) { return total ? Math.round((n / total) * 100) : 0; }
const MONTH_NAMES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const STAGE_COLORS: Record<string, string> = {
  recebido: "#3B82F6", respondido: "#8B5CF6", qualificado: "#F59E0B",
  negociacao: "#10B981", convertido: "#16A34A", perdido: "#EF4444",
};

// ─── Delta ────────────────────────────────────────────────────────────────────
function Delta({ curr, prev }: { curr: number; prev: number }) {
  if (prev === 0 || curr === prev) return null;
  const up = curr > prev;
  const Icon = up ? TrendingUp : TrendingDown;
  const v = Math.abs(Math.round(((curr - prev) / Math.abs(prev)) * 100));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 700, color: up ? "#16A34A" : "#DC2626", background: up ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)", padding: "2px 6px", borderRadius: 20 }}>
      <Icon size={9} /> {v}%
    </span>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub, accent, delta, attention }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  accent: string; delta?: React.ReactNode; attention?: boolean;
}) {
  return (
    <div style={{
      background: "var(--bg-surface)", borderRadius: 14,
      border: attention ? "1px solid rgba(217,119,6,0.3)" : "1px solid var(--border)",
      borderLeft: `3px solid ${attention ? "#D97706" : accent}`,
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12,
      boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: attention ? "rgba(217,119,6,0.1)" : `color-mix(in srgb, ${accent} 10%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
        {delta}
      </div>
      <div>
        <p style={{ fontSize: 27, fontWeight: 800, color: attention ? "#B45309" : "var(--text-primary)", lineHeight: 1, margin: 0, letterSpacing: "-0.5px" }}>{value}</p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 5, marginBottom: 0, fontWeight: 500 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: attention ? "#B45309" : "var(--text-muted)", marginTop: 2, marginBottom: 0 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</p>
        {subtitle && <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0 0" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Mini stat (atendimento) ─────────────────────────────────────────────────
function MiniStat({ icon, label, value, sub, attention }: { icon: React.ReactNode; label: string; value: string; sub?: string; attention?: boolean }) {
  return (
    <div style={{ background: "var(--bg-base)", border: `1px solid ${attention ? "rgba(217,119,6,0.3)" : "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>{icon}<span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span></div>
      <p style={{ fontSize: 20, fontWeight: 800, color: attention ? "#B45309" : "var(--text-primary)", margin: 0, letterSpacing: "-0.5px" }}>{value}</p>
      {sub && <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "2px 0 0" }}>{sub}</p>}
    </div>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function BarChart({ data, color, unit }: { data: { date: string; value: number }[]; color: string; unit: string }) {
  if (data.length === 0) return <EmptyChart label={`Sem ${unit} no período`} />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((a, d) => a + d.value, 0);
  const avg = total / data.length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96, paddingBottom: 4 }}>
        {data.map((d) => {
          const h = Math.max((d.value / max) * 80, d.value > 0 ? 4 : 2);
          const above = d.value > avg;
          return (
            <div key={d.date} title={`${d.date}: ${d.value} ${unit}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <div style={{ width: "100%", maxWidth: 18, height: h, background: above ? color : `color-mix(in srgb, ${color} 40%, transparent)`, borderRadius: "3px 3px 2px 2px", transition: "height 0.3s" }} />
              {data.length <= 16 && <span style={{ fontSize: 8, color: "var(--text-muted)", lineHeight: 1 }}>{d.date.slice(8)}</span>}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", textAlign: "right" }}>Total: {total} · média {avg.toFixed(1)}/dia</p>
    </div>
  );
}

// ─── Origin ───────────────────────────────────────────────────────────────────
function Origin({ ad, organic }: { ad: number; organic: number }) {
  const total = ad + organic || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <OriginLine icon={<Megaphone size={13} color="var(--accent)" />} label="Meta Ads" sub="referral capturado" val={ad} p={pct(ad, total)} color="var(--accent)" />
      <OriginLine icon={<MessageSquare size={13} color="#64748B" />} label="Orgânico / sem referral" sub="direto ou origem não identificada" val={organic} p={pct(organic, total)} color="#64748B" />
      {ad > 0 && organic > 0 && (
        <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--bg-elevated)" }}>
          <div style={{ width: `${pct(ad, total)}%`, background: "var(--accent)" }} />
          <div style={{ flex: 1, background: "#64748B", opacity: 0.4 }} />
        </div>
      )}
    </div>
  );
}
function OriginLine({ icon, label, sub, val, p, color }: { icon: React.ReactNode; label: string; sub: string; val: number; p: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in srgb, ${color} 10%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{sub}</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 }}>{val}<span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginLeft: 4 }}>{p}%</span></span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "var(--bg-elevated)", overflow: "hidden" }}>
          <div style={{ width: `${p}%`, height: "100%", background: color, opacity: 0.7, transition: "width 0.4s" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Funnel ───────────────────────────────────────────────────────────────────
const FUNNEL_ORDER = ["recebido","qualificado","negociacao","convertido","perdido"];
function Funnel({ funnel, noStage }: { funnel: Record<string, number>; noStage: number }) {
  const rows: { key: string; label: string; val: number; color: string }[] = [
    { key: "__none__", label: "Sem etapa", val: noStage, color: "#94A3B8" },
    ...FUNNEL_ORDER.map((k) => ({ key: k, label: FUNNEL_LABELS[k], val: funnel[k] ?? 0, color: STAGE_COLORS[k] })),
  ];
  const max = Math.max(...rows.map((r) => r.val), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)", width: 92, flexShrink: 0, fontWeight: 500 }}>{r.label}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ width: `${Math.max(pct(r.val, max), r.val > 0 ? 4 : 0)}%`, height: "100%", background: r.color, opacity: 0.8, transition: "width 0.4s" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", width: 28, textAlign: "right", flexShrink: 0 }}>{r.val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── CPL table ────────────────────────────────────────────────────────────────
function CplTable({ rows }: { rows: Overview["cpl"] }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 80px 90px 90px", padding: "0 4px 8px", borderBottom: "1px solid var(--border)", gap: 8 }}>
        {["Anúncio","Gasto","Leads reais","CPL real","CPL Meta"].map((h, i) => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 0 ? "left" : "right" }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.model} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 80px 90px 90px", padding: "10px 4px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.model}</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>{fmtBRL(r.spend)}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>{r.realLeads}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A", textAlign: "right" }}>{r.cplReal != null ? fmtBRL(r.cplReal) : "—"}</span>
          <span style={{ fontSize: 12, color: r.cplReal != null && r.cplMeta != null && r.cplReal > r.cplMeta ? "#DC2626" : "var(--text-muted)", textAlign: "right", textDecoration: r.cplReal != null && r.cplMeta != null && r.cplReal > r.cplMeta ? "line-through" : "none" }}>{r.cplMeta != null ? fmtBRL(r.cplMeta) : "—"}</span>
        </div>
      ))}
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0", fontStyle: "italic" }}>CPL real = gasto ÷ leads que chegaram. CPL Meta = gasto ÷ leads que o Meta contou.</p>
    </div>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────
function ValidationRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      {ok ? <CheckCircle2 size={16} style={{ color: "#16A34A", flexShrink: 0 }} /> : <AlertCircle size={16} style={{ color: "#D97706", flexShrink: 0 }} />}
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "24px 0", color: "var(--text-muted)" }}>
      <BarChart2 size={16} style={{ opacity: 0.3 }} />
      <span style={{ fontSize: 12.5 }}>{label}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function OperationDashboard({ clientId, year, month }: {
  clientId: string; year: number; month: number; onOpenContact?: (c: OpenContact) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/clients/${clientId}/whatsapp/overview?year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [clientId, year, month]);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 64, color: "var(--text-muted)" }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 12.5 }}>Carregando dados...</span>
    </div>
  );
  if (!data) return (
    <div style={{ textAlign: "center", padding: "64px 20px" }}>
      <BarChart2 size={32} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px", display: "block" }} />
      <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>Sem dados disponíveis para este período.</p>
    </div>
  );

  if (data.leads === 0) return (
    <div style={{ textAlign: "center", padding: "56px 24px", background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: "color-mix(in srgb, var(--accent) 8%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Inbox size={28} style={{ color: "var(--accent)", opacity: 0.7 }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Nenhum lead encontrado neste período</p>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 440, margin: "8px auto 0" }}>
        Quando novos contatos chegarem pelo WhatsApp, eles aparecerão aqui com origem, mensagens e dados para relatório.
      </p>
    </div>
  );

  const adCount = data.byOrigin.ad;

  // Resumo textual do período (sem IA).
  const monthName = MONTH_NAMES[month - 1];
  const topAd = data.byAd[0];
  const resumo = `Em ${monthName}, foram ${data.leads} ${data.leads === 1 ? "contato recebido" : "contatos recebidos"} pelo WhatsApp — `
    + `${adCount} ${adCount === 1 ? "veio" : "vieram"} de anúncio Meta Ads e ${data.byOrigin.organic} de forma orgânica ou sem referral identificado. `
    + `Os leads enviaram ${data.messagesReceived} ${data.messagesReceived === 1 ? "mensagem" : "mensagens"} no total`
    + (topAd ? `, e o anúncio "${topAd.adTitle}" gerou ${topAd.total} ${topAd.total === 1 ? "conversa" : "conversas"}.` : ".");

  const alerts: string[] = [];
  if (data.noStage > 0) alerts.push(`${data.noStage} lead${data.noStage > 1 ? "s" : ""} sem etapa no funil`);
  if (adCount === 0) alerts.push("Nenhum lead de anúncio identificado no período");
  if (data.byOrigin.organic > 0 && adCount === 0) alerts.push("Existem conversas sem origem identificada");

  // Validação
  const v = {
    contabilizados: data.leads,
    comReferral: adCount,
    comCampanha: data.campaignsWithLeads,
    comAnuncio: data.byAd.length,
    semReferral: data.byOrigin.organic,
    semEtapa: data.noStage,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Cards principais ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <MetricCard icon={<Users size={16} color="#3B82F6" />} label="Leads recebidos" value={data.leads} sub="contatos únicos no período" accent="#3B82F6" delta={data.previous.leads > 0 ? <Delta curr={data.leads} prev={data.previous.leads} /> : undefined} />
        <MetricCard icon={<Megaphone size={16} color="var(--accent)" />} label="Leads de anúncio" value={adCount} sub={`${pct(adCount, data.leads)}% · origem Meta Ads`} accent="var(--accent)" />
        <MetricCard icon={<MessageSquare size={16} color="#06B6D4" />} label="Leads orgânicos" value={data.byOrigin.organic} sub={`${pct(data.byOrigin.organic, data.leads)}% · sem referral`} accent="#06B6D4" />
        <MetricCard icon={<Inbox size={16} color="#0EA5E9" />} label="Mensagens recebidas" value={data.messagesReceived} sub={`${data.avgMessagesPerLead.toFixed(1)} por lead`} accent="#0EA5E9" />
        <MetricCard icon={<Layers size={16} color="#8B5CF6" />} label="Campanhas com leads" value={data.campaignsWithLeads} sub="identificadas no período" accent="#8B5CF6" />
        <MetricCard icon={<Hash size={16} color="#EC4899" />} label="Anúncios com leads" value={data.byAd.length} sub="criativos com conversas" accent="#EC4899" />
        <MetricCard icon={<Tag size={16} color="#D97706" />} label="Leads sem etapa" value={data.noStage} sub="precisam de classificação" accent="#D97706" attention={data.noStage > 0} />
        <MetricCard icon={<Target size={16} color="#16A34A" />} label="Convertidos" value={data.converted} sub={`${pct(data.converted, data.leads)}% · marcados no funil`} accent="#16A34A" delta={data.previous.converted > 0 ? <Delta curr={data.converted} prev={data.previous.converted} /> : undefined} />
      </div>

      {/* ── Resumo do período ── */}
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, var(--bg-surface)), var(--bg-surface))", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <Sparkles size={14} color="var(--accent)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Resumo do período</span>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>{resumo}</p>
        {alerts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {alerts.map((a) => (
              <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#92600A", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", padding: "5px 11px", borderRadius: 99 }}>
                <AlertCircle size={12} color="#D97706" /> {a}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Atendimento (forward-only, coexistência) ── */}
      <Section title="Atendimento (mensagens da loja)" subtitle="Tempo de resposta e cobertura — a partir da ativação do espelhamento de saída">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, #0EA5E9 6%, transparent)", border: "1px solid color-mix(in srgb, #0EA5E9 20%, var(--border))", marginBottom: 14 }}>
          <Info size={13} color="#0EA5E9" />
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Métricas de resposta valem a partir da ativação da coexistência. Conversas anteriores não têm mensagens da loja capturadas.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <MiniStat icon={<Send size={14} color="#16A34A" />} label="Mensagens da loja" value={String(data.storeMessages)} />
          <MiniStat icon={<MessageSquare size={14} color="#16A34A" />} label="Conversas respondidas" value={String(data.withReply)} sub={`${pct(data.withReply, data.withReply + data.withoutReply)}%`} />
          <MiniStat icon={<AlertCircle size={14} color={data.withoutReply ? "#D97706" : "#94A3B8"} />} label="Sem resposta" value={String(data.withoutReply)} attention={data.withoutReply > 0} />
          <MiniStat icon={<Clock size={14} color="#0EA5E9" />} label="Tempo médio 1ª resposta" value={fmtDur(data.avgFirstResponseSec)} sub={data.medianFirstResponseSec != null ? `mediana ${fmtDur(data.medianFirstResponseSec)}` : undefined} />
          <MiniStat icon={<TrendingUp size={14} color="#16A34A" />} label="Mais rápida" value={fmtDur(data.responseMinSec)} />
          <MiniStat icon={<TrendingDown size={14} color="#D97706" />} label="Mais lenta" value={fmtDur(data.responseMaxSec)} />
        </div>
      </Section>

      {/* ── Gráficos ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <Section title="Leads por dia" subtitle="Volume diário de contatos recebidos">
          <BarChart data={data.series.map((s) => ({ date: s.date, value: s.leads }))} color="var(--accent)" unit="leads" />
        </Section>
        <Section title="Mensagens por dia" subtitle="Quantidade de mensagens enviadas pelos leads">
          <BarChart data={data.messagesSeries.map((s) => ({ date: s.date, value: s.messages }))} color="#0EA5E9" unit="mensagens" />
        </Section>
        <Section title="Origem dos contatos" subtitle="Meta Ads vs. orgânico / sem referral">
          <Origin ad={data.byOrigin.ad} organic={data.byOrigin.organic} />
        </Section>
        <Section title="Funil comercial" subtitle="Classificação manual dos leads por etapa">
          <Funnel funnel={data.funnel} noStage={data.noStage} />
        </Section>
      </div>

      {/* ── CPL ── */}
      {data.cpl.length > 0 && (
        <Section title="Custo por lead real" subtitle="Gasto Meta × leads que realmente chegaram no WhatsApp">
          <CplTable rows={data.cpl} />
        </Section>
      )}

      {/* ── Validação para relatório ── */}
      <Section title="Validação para relatório mensal" subtitle="Confira os números antes de entregar ao cliente">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px 24px" }}>
          <ValidationRow ok label={`${v.contabilizados} leads contabilizados`} />
          <ValidationRow ok={v.comReferral > 0} label={`${v.comReferral} com referral Meta Ads`} />
          <ValidationRow ok={v.comCampanha > 0} label={`${v.comCampanha} campanha${v.comCampanha !== 1 ? "s" : ""} identificada${v.comCampanha !== 1 ? "s" : ""}`} />
          <ValidationRow ok={v.comAnuncio > 0} label={`${v.comAnuncio} anúncio${v.comAnuncio !== 1 ? "s" : ""} identificado${v.comAnuncio !== 1 ? "s" : ""}`} />
          <ValidationRow ok={v.semReferral === 0} label={`${v.semReferral} sem referral de anúncio`} />
          <ValidationRow ok={v.semEtapa === 0} label={`${v.semEtapa} sem etapa no funil`} />
        </div>
      </Section>

      <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", margin: 0 }}>
        {data.leads} leads · {data.messagesReceived} mensagens recebidas · atualização em tempo real
      </p>
    </div>
  );
}
