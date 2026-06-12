"use client";

import { useEffect, useState } from "react";
import { Sparkles, TrendingUp, AlertTriangle, AlertOctagon, Info } from "lucide-react";

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
  critical: { color: "#DC2626", bg: "rgba(220,38,38,0.09)", icon: AlertOctagon, label: "Atenção crítica" },
  warning:  { color: "#D97706", bg: "rgba(217,119,6,0.09)", icon: AlertTriangle, label: "Ponto de atenção" },
  positive: { color: "#16A34A", bg: "rgba(22,163,74,0.09)", icon: TrendingUp, label: "Destaque positivo" },
  info:     { color: "#64748B", bg: "rgba(100,116,139,0.09)", icon: Info, label: "Observação" },
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
    return <div className="skeleton-surface" style={{ height: 92, borderRadius: 14 }} />;
  }
  if (!data || (data.insights.length === 0 && !data.narrative?.text)) return null;

  const top = data.insights[0]; // já vem ordenado por severidade
  const rest = data.insights.slice(1, 6); // compacto: no máx. 5 chips
  const s = top ? SEV[top.severity] : null;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      {/* Cabeçalho compacto */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px 0" }}>
        <Sparkles size={14} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Co-piloto</span>
        {data.narrative?.source === "ai" && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "1px 6px", borderRadius: 99 }}>IA</span>
        )}
      </div>

      {/* Destaque do dia (insight mais crítico) */}
      {top && s && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, margin: "10px 14px 0", padding: "11px 13px", borderRadius: 10, background: s.bg, borderLeft: `3px solid ${s.color}` }}>
          <s.icon size={16} style={{ color: s.color, flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.35 }}>{top.title}</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", lineHeight: 1.45 }}>{top.detail}</p>
          </div>
        </div>
      )}

      {/* Narrativa (uma linha calma) */}
      {data.narrative?.text && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5, margin: "10px 18px 0", fontStyle: "italic" }}>{data.narrative.text}</p>
      )}

      {/* Demais sinais como chips compactos */}
      {rest.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 16px 14px" }}>
          {rest.map((ins) => {
            const c = SEV[ins.severity];
            return (
              <span key={ins.id} title={ins.detail} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "4px 9px", borderRadius: 99, maxWidth: "100%" }}>
                <c.icon size={11} style={{ color: c.color, flexShrink: 0 }} />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ins.title}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
