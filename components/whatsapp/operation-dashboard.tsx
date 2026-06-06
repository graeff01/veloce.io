"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Users, MessageSquare, Clock, AlertCircle, AlertTriangle, Megaphone, Hourglass, Filter,
} from "lucide-react";
import { fmtDuration, timeAgo, FUNNEL_LABELS } from "@/lib/wa-format";

interface Overview {
  leads: number; responded: number; unanswered: number; responseRate: number;
  avgFirstResponseSec: number | null; medianFirstResponseSec: number | null;
  buckets: { upTo5min: number; upTo30min: number; upTo1h: number; over1h: number; unanswered: number };
  byOrigin: { ad: number; organic: number };
  byAd: { adTitle: string; total: number }[];
  series: { date: string; leads: number }[];
  funnel: Record<string, number>;
  waitingNow: number;
  alerts: { waiting: number; abandoned: number; sample: { contactId: string; name: string | null; waId: string; waitingSince: string | null }[] };
}

export interface OpenContact { contactId: string; name: string | null; phone: string | null }

export function OperationDashboard({ clientId, year, month, onOpenContact }: {
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
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );
  if (!data) return <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 24 }}>Sem dados ainda.</p>;

  const pct = (n: number) => (data.leads ? Math.round((n / data.leads) * 100) : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Alertas operacionais */}
      {data.alerts.waiting > 0 && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.06)", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: data.alerts.sample.length ? 10 : 0 }}>
            <AlertTriangle size={15} color="#DC2626" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>
              {data.alerts.waiting} lead{data.alerts.waiting !== 1 ? "s" : ""} aguardando resposta há mais de 2h
            </span>
            {data.alerts.abandoned > 0 && (
              <span style={{ fontSize: 12, color: "#DC2626", opacity: 0.85 }}>· {data.alerts.abandoned} sem retorno há +24h</span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.alerts.sample.map((a) => (
              <button key={a.contactId} onClick={() => onOpenContact?.({ contactId: a.contactId, name: a.name, phone: a.waId })}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(220,38,38,0.25)", background: "var(--bg-surface)", cursor: "pointer", fontSize: 11.5, color: "var(--text-primary)" }}>
                <Hourglass size={11} color="#DC2626" />
                {a.name ?? `+${a.waId}`}
                <span style={{ color: "var(--text-muted)" }}>· {timeAgo(a.waitingSince)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Kpi icon={<Users size={15} color="var(--accent)" />} label="Leads recebidos" value={String(data.leads)} />
        <Kpi icon={<MessageSquare size={15} color="#16A34A" />} label="Taxa de resposta" value={`${Math.round(data.responseRate * 100)}%`} sub={`${data.responded} respondidos`} />
        <Kpi icon={<AlertCircle size={15} color="#DC2626" />} label="Sem resposta" value={String(data.unanswered)} danger={data.unanswered > 0} sub={data.unanswered > 0 ? "leads ignorados" : undefined} />
        <Kpi icon={<Clock size={15} color="#D97706" />} label="1ª resposta (média)" value={fmtDuration(data.avgFirstResponseSec)} sub={data.medianFirstResponseSec != null ? `mediana ${fmtDuration(data.medianFirstResponseSec)}` : undefined} />
        <Kpi icon={<Hourglass size={15} color="#2563EB" />} label="Aguardando agora" value={String(data.waitingNow)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {/* Leads no tempo */}
        <Card title="Leads por dia">
          <BarSeries series={data.series} />
        </Card>

        {/* Velocidade de atendimento */}
        <Card title="Velocidade de atendimento">
          <DistBar data={data} />
        </Card>

        {/* Origem */}
        <Card title="Origem dos leads">
          <Origin ad={data.byOrigin.ad} organic={data.byOrigin.organic} />
        </Card>

        {/* Funil */}
        <Card title="Funil">
          <Funnel funnel={data.funnel} />
        </Card>

        {/* Por anúncio */}
        {data.byAd.length > 0 && (
          <Card title="Leads por anúncio">
            <ByAd items={data.byAd} max={Math.max(...data.byAd.map((a) => a.total))} />
          </Card>
        )}
      </div>
      <p style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "right" }}>
        {pct(data.responded)}% dos leads respondidos no período · dados em tempo real
      </p>
    </div>
  );
}

// ── Subcomponentes ───────────────────────────────────────────────────────────
function Kpi({ icon, label, value, sub, danger }: { icon: React.ReactNode; label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: `1px solid ${danger ? "rgba(220,38,38,0.3)" : "var(--border)"}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 19, fontWeight: 700, color: danger ? "#DC2626" : "var(--text-primary)", lineHeight: 1, margin: 0 }}>{value}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{label}</p>
        {sub && <p style={{ fontSize: 10, color: danger ? "#DC2626" : "var(--text-muted)", marginTop: 2, opacity: 0.85 }}>{sub}</p>}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>{title}</p>
      {children}
    </div>
  );
}

function BarSeries({ series }: { series: { date: string; leads: number }[] }) {
  if (series.length === 0) return <Empty />;
  const max = Math.max(...series.map((s) => s.leads), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
      {series.map((s) => (
        <div key={s.date} title={`${s.date}: ${s.leads}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <div style={{ width: "100%", maxWidth: 22, height: `${(s.leads / max) * 96}px`, minHeight: 2, background: "var(--accent)", borderRadius: 4, opacity: 0.85 }} />
          <span style={{ fontSize: 8.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{s.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

function DistBar({ data }: { data: Overview }) {
  const segs = [
    { label: "≤ 5 min", val: data.buckets.upTo5min, color: "#16A34A" },
    { label: "5–30 min", val: data.buckets.upTo30min, color: "#65A30D" },
    { label: "30min–1h", val: data.buckets.upTo1h, color: "#D97706" },
    { label: "> 1h", val: data.buckets.over1h, color: "#EA580C" },
    { label: "Sem resposta", val: data.buckets.unanswered, color: "#DC2626" },
  ].filter((s) => s.val > 0);
  const total = data.leads || 1;
  if (segs.length === 0) return <Empty />;
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "var(--bg-elevated)" }}>
        {segs.map((s) => <div key={s.label} title={`${s.label}: ${s.val}`} style={{ width: `${(s.val / total) * 100}%`, background: s.color }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
        {segs.map((s) => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} /> {s.label} · <strong style={{ color: "var(--text-primary)" }}>{s.val}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function Origin({ ad, organic }: { ad: number; organic: number }) {
  const total = ad + organic || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Line icon={<Megaphone size={12} color="var(--accent)" />} label="Anúncio" val={ad} pct={Math.round((ad / total) * 100)} color="var(--accent)" />
      <Line icon={<MessageSquare size={12} color="#64748B" />} label="Orgânico / outros" val={organic} pct={Math.round((organic / total) * 100)} color="#64748B" />
    </div>
  );
}

function Funnel({ funnel }: { funnel: Record<string, number> }) {
  const order = ["recebido", "respondido", "qualificado", "negociacao", "convertido"];
  const max = Math.max(funnel.recebido ?? 0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {order.map((k) => (
        <Line key={k} label={FUNNEL_LABELS[k]} val={funnel[k] ?? 0} pct={Math.round(((funnel[k] ?? 0) / max) * 100)} color="var(--accent)" />
      ))}
      {(funnel.perdido ?? 0) > 0 && <Line label={FUNNEL_LABELS.perdido} val={funnel.perdido} pct={Math.round((funnel.perdido / max) * 100)} color="#DC2626" />}
    </div>
  );
}

function ByAd({ items, max }: { items: { adTitle: string; total: number }[]; max: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.slice(0, 8).map((a) => (
        <Line key={a.adTitle} label={a.adTitle} val={a.total} pct={Math.round((a.total / max) * 100)} color="var(--accent)" icon={<Megaphone size={11} color="var(--accent)" />} />
      ))}
    </div>
  );
}

function Line({ icon, label, val, pct, color }: { icon?: React.ReactNode; label: string; val: number; pct: number; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{icon}{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 }}>{val}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, opacity: 0.85 }} />
      </div>
    </div>
  );
}

function Empty() {
  return <p style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}><Filter size={12} /> Sem dados no período.</p>;
}
