"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Users, MessageSquare, Clock, AlertTriangle, Megaphone,
  Hourglass, Target, DollarSign, TrendingUp, TrendingDown,
  Zap, BarChart2, ArrowRight, CheckCircle2, XCircle, Circle,
} from "lucide-react";
import { fmtDuration, timeAgo, FUNNEL_LABELS } from "@/lib/wa-format";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Overview {
  leads: number; responded: number; unanswered: number; responseRate: number; converted: number;
  avgFirstResponseSec: number | null; medianFirstResponseSec: number | null;
  buckets: { upTo5min: number; upTo30min: number; upTo1h: number; over1h: number; unanswered: number };
  byOrigin: { ad: number; organic: number };
  byAd: { adTitle: string; total: number; converted: number; conversionRate: number }[];
  series: { date: string; leads: number }[];
  funnel: Record<string, number>;
  waitingNow: number;
  alerts: { waiting: number; abandoned: number; sample: { contactId: string; name: string | null; waId: string; waitingSince: string | null }[] };
  previous: { leads: number; responseRate: number; avgFirstResponseSec: number | null; unanswered: number; converted: number };
  cpl: { model: string; realLeads: number; spend: number; cplReal: number | null; metaLeads: number; cplMeta: number | null }[];
}
export interface OpenContact { contactId: string; name: string | null; phone: string | null }

// ─── Utils ────────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0;
}

// ─── Delta chip ───────────────────────────────────────────────────────────────
function Delta({ curr, prev, goodWhenUp }: { curr: number; prev: number; goodWhenUp: boolean }) {
  if (prev === 0 || Math.abs(curr - prev) < 0.001) return <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>estável</span>;
  const up = curr > prev;
  const good = up === goodWhenUp;
  const Icon = up ? TrendingUp : TrendingDown;
  const pctVal = Math.abs(Math.round(((curr - prev) / Math.abs(prev)) * 100));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 700, color: good ? "#16A34A" : "#DC2626", background: good ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)", padding: "2px 6px", borderRadius: 20 }}>
      <Icon size={9} /> {pctVal}%
    </span>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ icon, label, value, sub, accentColor, delta, alert }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  accentColor: string; delta?: React.ReactNode; alert?: boolean;
}) {
  return (
    <div style={{
      background: "var(--bg-surface)", borderRadius: 14,
      border: alert ? `1px solid rgba(220,38,38,0.25)` : "1px solid var(--border)",
      borderLeft: `3px solid ${alert ? "#DC2626" : accentColor}`,
      padding: "16px 18px",
      boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: alert ? "rgba(220,38,38,0.08)" : `color-mix(in srgb, ${accentColor} 10%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        {delta}
      </div>
      <div>
        <p style={{ fontSize: 28, fontWeight: 800, color: alert ? "#DC2626" : "var(--text-primary)", lineHeight: 1, margin: 0, letterSpacing: "-0.5px" }}>{value}</p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, marginBottom: 0, fontWeight: 500 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: alert ? "#DC2626" : "var(--text-muted)", marginTop: 2, marginBottom: 0 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</p>
          {subtitle && <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0 0" }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function LeadsByDay({ series }: { series: { date: string; leads: number }[] }) {
  if (series.length === 0) return <EmptyState label="Nenhum lead no período" />;
  const max = Math.max(...series.map((s) => s.leads), 1);
  const total = series.reduce((a, s) => a + s.leads, 0);
  const avg = total / series.length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100, paddingBottom: 4 }}>
        {series.map((s) => {
          const h = Math.max((s.leads / max) * 84, s.leads > 0 ? 4 : 2);
          const isAbove = s.leads > avg;
          return (
            <div key={s.date} title={`${s.date}: ${s.leads} leads`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <div style={{ width: "100%", maxWidth: 18, height: h, background: isAbove ? "var(--accent)" : "color-mix(in srgb, var(--accent) 40%, transparent)", borderRadius: "3px 3px 2px 2px", transition: "height 0.3s" }} />
              {series.length <= 15 && <span style={{ fontSize: 8, color: "var(--text-muted)", lineHeight: 1 }}>{s.date.slice(8)}</span>}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", textAlign: "right" }}>Média: {avg.toFixed(1)} leads/dia</p>
    </div>
  );
}

// ─── Response speed ───────────────────────────────────────────────────────────
function ResponseSpeed({ data }: { data: Overview }) {
  const segs = [
    { label: "≤ 5 min", val: data.buckets.upTo5min, color: "#16A34A" },
    { label: "5–30 min", val: data.buckets.upTo30min, color: "#65A30D" },
    { label: "30min–1h", val: data.buckets.upTo1h, color: "#D97706" },
    { label: "> 1h", val: data.buckets.over1h, color: "#EA580C" },
    { label: "Sem resposta", val: data.buckets.unanswered, color: "#DC2626" },
  ].filter((s) => s.val > 0);
  const total = data.leads || 1;
  if (segs.length === 0) return <EmptyState label="Sem dados de resposta" />;
  const fastPct = pct(data.buckets.upTo5min + data.buckets.upTo30min, total);
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "var(--bg-elevated)", marginBottom: 14 }}>
        {segs.map((s) => <div key={s.label} title={`${s.label}: ${s.val}`} style={{ width: `${(s.val / total) * 100}%`, background: s.color, transition: "width 0.4s" }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {segs.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{s.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)" }}>{s.val}</span>
          </div>
        ))}
      </div>
      {fastPct > 0 && <p style={{ fontSize: 11, color: "#16A34A", margin: "10px 0 0", fontWeight: 600 }}>{fastPct}% respondidos em até 30 min</p>}
    </div>
  );
}

// ─── Origin ───────────────────────────────────────────────────────────────────
function Origin({ ad, organic }: { ad: number; organic: number }) {
  const total = ad + organic || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <OriginLine icon={<Megaphone size={13} color="var(--accent)" />} label="Meta Ads" sub="Click-to-WhatsApp" val={ad} pct={pct(ad, total)} color="var(--accent)" />
      <OriginLine icon={<MessageSquare size={13} color="#64748B" />} label="Orgânico" sub="Direto ou indicação" val={organic} pct={pct(organic, total)} color="#64748B" />
      {ad > 0 && organic > 0 && (
        <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--bg-elevated)" }}>
          <div style={{ width: `${pct(ad, total)}%`, background: "var(--accent)", transition: "width 0.4s" }} />
          <div style={{ flex: 1, background: "#64748B", opacity: 0.4 }} />
        </div>
      )}
    </div>
  );
}
function OriginLine({ icon, label, sub, val, pct: p, color }: { icon: React.ReactNode; label: string; sub: string; val: number; pct: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in srgb, ${color} 10%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{sub}</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{val}<span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginLeft: 4 }}>{p}%</span></span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "var(--bg-elevated)", overflow: "hidden" }}>
          <div style={{ width: `${p}%`, height: "100%", background: color, opacity: 0.7, transition: "width 0.4s" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Funnel ───────────────────────────────────────────────────────────────────
const FUNNEL_ORDER = ["recebido","respondido","qualificado","negociacao","convertido"];
const FUNNEL_COLORS: Record<string, string> = {
  recebido: "#3B82F6", respondido: "#8B5CF6", qualificado: "#F59E0B",
  negociacao: "#10B981", convertido: "#16A34A", perdido: "#EF4444",
};
function Funnel({ funnel }: { funnel: Record<string, number> }) {
  const max = Math.max(funnel.recebido ?? 0, 1);
  const keys = [...FUNNEL_ORDER, ...(funnel.perdido ? ["perdido"] : [])];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {keys.map((k) => {
        const val = funnel[k] ?? 0;
        const w = Math.max(pct(val, max), val > 0 ? 4 : 0);
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)", width: 88, flexShrink: 0, fontWeight: 500 }}>{FUNNEL_LABELS[k]}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--bg-elevated)", overflow: "hidden" }}>
              <div style={{ width: `${w}%`, height: "100%", background: FUNNEL_COLORS[k] ?? "var(--accent)", opacity: 0.8, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", width: 28, textAlign: "right", flexShrink: 0 }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Ad ranking ───────────────────────────────────────────────────────────────
function AdRanking({ items, maxLeads }: { items: Overview["byAd"]; maxLeads: number }) {
  if (items.length === 0) return <EmptyState label="Nenhum lead de anúncio no período" />;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 80px 80px", padding: "0 4px 8px", borderBottom: "1px solid var(--border)", gap: 8 }}>
        {["Anúncio", "Leads", "Convertidos", "Taxa"].map((h, i) => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 0 ? "left" : "right" }}>{h}</span>
        ))}
      </div>
      {items.slice(0, 8).map((a, i) => (
        <div key={a.adTitle} style={{ display: "grid", gridTemplateColumns: "1fr 64px 80px 80px", padding: "10px 4px", borderBottom: i < Math.min(items.length, 8) - 1 ? "1px solid var(--border)" : "none", alignItems: "center", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Megaphone size={11} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.adTitle}</span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: "var(--bg-elevated)", overflow: "hidden" }}>
              <div style={{ width: `${pct(a.total, maxLeads)}%`, height: "100%", background: "var(--accent)", opacity: 0.6 }} />
            </div>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>{a.total}</span>
          <span style={{ fontSize: 13, fontWeight: a.converted > 0 ? 700 : 400, color: a.converted > 0 ? "#16A34A" : "var(--text-muted)", textAlign: "right" }}>{a.converted > 0 ? a.converted : "—"}</span>
          <span style={{ fontSize: 12, color: a.conversionRate > 0.1 ? "#16A34A" : "var(--text-secondary)", textAlign: "right", fontWeight: 600 }}>
            {a.conversionRate > 0 ? `${Math.round(a.conversionRate * 100)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── CPL table ────────────────────────────────────────────────────────────────
function CplTable({ rows }: { rows: Overview["cpl"] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
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
          <span style={{ fontSize: 12, color: r.cplReal != null && r.cplMeta != null && r.cplReal > r.cplMeta ? "#DC2626" : "var(--text-muted)", textAlign: "right", textDecoration: r.cplReal != null && r.cplMeta != null && r.cplReal > r.cplMeta ? "line-through" : "none" }}>
            {r.cplMeta != null ? fmtBRL(r.cplMeta) : "—"}
          </span>
        </div>
      ))}
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0", fontStyle: "italic" }}>
        CPL real = gasto ÷ leads que chegaram. CPL Meta = gasto ÷ leads que o Meta contou.
      </p>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "24px 0", color: "var(--text-muted)" }}>
      <BarChart2 size={16} style={{ opacity: 0.3 }} />
      <span style={{ fontSize: 12.5 }}>{label}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function OperationDashboard({ clientId, year, month, onOpenContact }: {
  clientId: string; year: number; month: number; onOpenContact?: (c: OpenContact) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
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
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, opacity: 0.7 }}>Conecte o WhatsApp e aguarde as primeiras mensagens chegarem.</p>
    </div>
  );

  const adCount = data.byOrigin.ad;
  const maxAdLeads = data.byAd.length ? Math.max(...data.byAd.map((a) => a.total)) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Alert band ── */}
      {data.alerts.waiting > 0 && (
        <div style={{ borderRadius: 14, border: "1px solid rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.04)", padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: data.alerts.sample.length ? 14 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(220,38,38,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={16} color="#DC2626" />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", margin: 0 }}>
                  {data.alerts.waiting} lead{data.alerts.waiting !== 1 ? "s" : ""} aguardando resposta há mais de 2h
                </p>
                {data.alerts.abandoned > 0 && (
                  <p style={{ fontSize: 12, color: "#DC2626", opacity: 0.8, margin: "2px 0 0" }}>
                    {data.alerts.abandoned} sem retorno há mais de 24h — em risco de abandono
                  </p>
                )}
              </div>
            </div>
          </div>
          {data.alerts.sample.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.alerts.sample.map((a) => (
                <button key={a.contactId} onClick={() => onOpenContact?.({ contactId: a.contactId, name: a.name, phone: a.waId })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, border: "1px solid rgba(220,38,38,0.2)", background: "var(--bg-surface)", cursor: "pointer", fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>
                  <Hourglass size={11} color="#DC2626" />
                  {a.name ?? `+${a.waId}`}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{timeAgo(a.waitingSince)}</span>
                  <ArrowRight size={10} color="#DC2626" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Kpi
          icon={<Users size={16} color="#3B82F6" />}
          label="Leads recebidos"
          value={String(data.leads)}
          sub={data.leads === 0 ? "Nenhum lead no período" : `${pct(data.byOrigin.ad, data.leads)}% de anúncios`}
          accentColor="#3B82F6"
          delta={data.previous.leads > 0 ? <Delta curr={data.leads} prev={data.previous.leads} goodWhenUp /> : undefined}
        />
        <Kpi
          icon={<MessageSquare size={16} color="#16A34A" />}
          label="Taxa de resposta"
          value={`${Math.round(data.responseRate * 100)}%`}
          sub={`${data.responded} de ${data.leads} respondidos`}
          accentColor="#16A34A"
          delta={data.previous.responseRate > 0 ? <Delta curr={data.responseRate} prev={data.previous.responseRate} goodWhenUp /> : undefined}
        />
        <Kpi
          icon={<AlertTriangle size={16} color={data.unanswered > 0 ? "#DC2626" : "#94A3B8"} />}
          label="Sem resposta"
          value={String(data.unanswered)}
          sub={data.unanswered > 0 ? `${pct(data.unanswered, data.leads)}% dos leads ignorados` : "Nenhum lead ignorado"}
          accentColor={data.unanswered > 0 ? "#DC2626" : "#94A3B8"}
          alert={data.unanswered > 0}
          delta={data.previous.unanswered > 0 ? <Delta curr={data.unanswered} prev={data.previous.unanswered} goodWhenUp={false} /> : undefined}
        />
        <Kpi
          icon={<Clock size={16} color="#D97706" />}
          label="1ª resposta (média)"
          value={fmtDuration(data.avgFirstResponseSec)}
          sub={data.medianFirstResponseSec != null ? `Mediana: ${fmtDuration(data.medianFirstResponseSec)}` : undefined}
          accentColor="#D97706"
          delta={data.avgFirstResponseSec != null && data.previous.avgFirstResponseSec != null
            ? <Delta curr={data.avgFirstResponseSec} prev={data.previous.avgFirstResponseSec} goodWhenUp={false} />
            : undefined}
        />
        <Kpi
          icon={<Megaphone size={16} color="var(--accent)" />}
          label="Leads de anúncio"
          value={String(adCount)}
          sub={data.leads > 0 ? `${pct(adCount, data.leads)}% do total` : undefined}
          accentColor="var(--accent)"
        />
        <Kpi
          icon={<Target size={16} color="#7C3AED" />}
          label="Convertidos"
          value={String(data.converted)}
          sub={data.leads ? `${pct(data.converted, data.leads)}% dos leads` : undefined}
          accentColor="#7C3AED"
          delta={data.previous.converted > 0 ? <Delta curr={data.converted} prev={data.previous.converted} goodWhenUp /> : undefined}
        />
      </div>

      {/* ── CPL ── */}
      {data.cpl.length > 0 && (
        <SectionCard
          title="Custo por lead real"
          subtitle="Gasto Meta × leads que realmente chegaram no WhatsApp"
        >
          <CplTable rows={data.cpl} />
        </SectionCard>
      )}

      {/* ── Charts grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <SectionCard title="Leads por dia" subtitle={`${data.series.reduce((a, s) => a + s.leads, 0)} leads no período`}>
          <LeadsByDay series={data.series} />
        </SectionCard>
        <SectionCard title="Velocidade de atendimento" subtitle="Distribuição do tempo até a 1ª resposta">
          <ResponseSpeed data={data} />
        </SectionCard>
        <SectionCard title="Origem dos leads" subtitle="Meta Ads vs. orgânico / direto">
          <Origin ad={data.byOrigin.ad} organic={data.byOrigin.organic} />
        </SectionCard>
        <SectionCard title="Funil comercial" subtitle="Progresso das etapas de negociação">
          <Funnel funnel={data.funnel} />
        </SectionCard>
      </div>

      {/* ── Ad ranking ── */}
      {data.byAd.length > 0 && (
        <SectionCard title="Performance por anúncio" subtitle="Leads e conversão por criativo / anúncio">
          <AdRanking items={data.byAd} maxLeads={maxAdLeads} />
        </SectionCard>
      )}

      {/* Footer */}
      <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", margin: 0 }}>
        {pct(data.responded, data.leads)}% dos leads respondidos · atualização em tempo real
      </p>
    </div>
  );
}
