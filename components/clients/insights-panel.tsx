"use client";

import { useEffect, useState } from "react";
import { Sparkles, TrendingUp, AlertTriangle, AlertOctagon, Info, Loader2 } from "lucide-react";

interface Insight {
  id: string;
  severity: "critical" | "warning" | "positive" | "info";
  category: string;
  title: string;
  detail: string;
}
interface InsightsResponse {
  insights: Insight[];
  narrative: { text: string; source: "ai" | "fallback" };
}

const SEV = {
  critical: { color: "#DC2626", bg: "rgba(220,38,38,0.08)", icon: AlertOctagon },
  warning:  { color: "#D97706", bg: "rgba(217,119,6,0.08)", icon: AlertTriangle },
  positive: { color: "#16A34A", bg: "rgba(22,163,74,0.08)", icon: TrendingUp },
  info:     { color: "#64748B", bg: "rgba(100,116,139,0.08)", icon: Info },
} as const;

export function InsightsPanel({ clientId, year, month }: { clientId: string; year: number; month: number }) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/clients/${clientId}/insights?year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => { if (active) { setData(null); setLoading(false); } });
    return () => { active = false; };
  }, [clientId, year, month]);

  if (loading) {
    return (
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Analisando a operação...</span>
      </div>
    );
  }
  if (!data || (data.insights.length === 0 && !data.narrative?.text)) return null;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      {/* Header + narrativa */}
      <div style={{ padding: "16px 20px", borderBottom: data.insights.length ? "1px solid var(--border)" : "none", background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Sparkles size={15} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.03em", textTransform: "uppercase" }}>Co-piloto de operação</span>
          {data.narrative?.source === "ai" && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "1px 7px", borderRadius: 99 }}>IA</span>
          )}
        </div>
        {data.narrative?.text && (
          <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.55, margin: 0, fontWeight: 500 }}>{data.narrative.text}</p>
        )}
      </div>

      {/* Insights */}
      {data.insights.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 1, background: "var(--border)" }}>
          {data.insights.map((ins) => {
            const s = SEV[ins.severity];
            const Icon = s.icon;
            return (
              <div key={ins.id} style={{ background: "var(--bg-surface)", padding: "13px 18px", display: "flex", gap: 11, alignItems: "flex-start" }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <Icon size={14} style={{ color: s.color }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.35 }}>{ins.title}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0 0", lineHeight: 1.45 }}>{ins.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
