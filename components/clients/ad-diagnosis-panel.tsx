"use client";

import { useMemo, useState } from "react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import {
  Sparkles, AlertOctagon, AlertTriangle, TrendingUp, Info, Activity,
  ChevronDown, ChevronRight, Megaphone, ShieldCheck,
} from "lucide-react";

// ── Tipos (espelham lib/ad-diagnosis.ts) ─────────────────────────────────────
type Severity = "critical" | "warning" | "positive" | "info" | "neutral";
interface Signal { severity: Severity; text: string }
interface Diagnosis {
  adId: string; name: string; campaignName: string; status: string;
  severity: Severity; scenario: string; title: string; action: string;
  confidence: "alta" | "media" | "baixa";
  evidence: string[]; signals: Signal[];
}
interface DiagnosisResponse {
  connected: boolean; hasData: boolean; baselineCpl: number | null;
  ads: Diagnosis[]; counts: Record<Severity, number>;
  narrative: { text: string; source: "ai" | "fallback" };
}

const SEV = {
  critical: { color: "#DC2626", bg: "rgba(220,38,38,0.09)", icon: AlertOctagon, label: "Crítico" },
  warning:  { color: "#D97706", bg: "rgba(217,119,6,0.09)", icon: AlertTriangle, label: "Atenção" },
  positive: { color: "#16A34A", bg: "rgba(22,163,74,0.09)", icon: TrendingUp, label: "Bom" },
  neutral:  { color: "#64748B", bg: "rgba(100,116,139,0.09)", icon: Activity, label: "Observação" },
  info:     { color: "#2563EB", bg: "rgba(37,99,235,0.07)", icon: Info, label: "Info" },
} as const;

const CONF = {
  alta:  { label: "Confiança alta", color: "#16A34A" },
  media: { label: "Confiança média", color: "#D97706" },
  baixa: { label: "Amostra pequena", color: "#64748B" },
} as const;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AdDiagnosisPanel({ clientId, year, month }: { clientId: string; year: number; month: number }) {
  const [showHealthy, setShowHealthy] = useState(false);
  const { data, loading } = useCachedFetch<DiagnosisResponse>(
    `/api/clients/${clientId}/meta/ads/diagnosis?year=${year}&month=${month}`,
  );

  const { action, healthy } = useMemo(() => {
    const ads = data?.ads ?? [];
    return {
      action: ads.filter((a) => a.severity === "critical" || a.severity === "warning"),
      healthy: ads.filter((a) => a.severity === "positive" || a.severity === "info" || a.severity === "neutral"),
    };
  }, [data]);

  if (loading) return <div className="skeleton-surface" style={{ height: 120, borderRadius: 14 }} />;
  if (!data || !data.connected || !data.hasData) return null;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px 0", flexWrap: "wrap" }}>
        <Sparkles size={14} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Diagnóstico dos anúncios</span>
        {data.narrative?.source === "ai" && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "1px 6px", borderRadius: 99 }}>IA</span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {data.counts.critical > 0 && <Pill color={SEV.critical.color} text={`${data.counts.critical} crítico${data.counts.critical > 1 ? "s" : ""}`} />}
          {data.counts.warning > 0 && <Pill color={SEV.warning.color} text={`${data.counts.warning} atenção`} />}
          {data.baselineCpl != null && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>CPL alvo <b style={{ color: "var(--text-secondary)" }}>{brl(data.baselineCpl)}</b></span>}
        </span>
      </div>

      {/* Narrativa */}
      {data.narrative?.text && (
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, margin: "10px 18px 4px" }}>{data.narrative.text}</p>
      )}

      {/* Cards que pedem ação */}
      <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {action.map((a) => <Card key={a.adId} d={a} />)}

        {action.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 10, background: SEV.positive.bg }}>
            <ShieldCheck size={15} style={{ color: SEV.positive.color }} />
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Nenhum anúncio pedindo ação no período. Tudo dentro da referência.</span>
          </div>
        )}

        {/* Saudáveis recolhidos */}
        {healthy.length > 0 && (
          <>
            <button onClick={() => setShowHealthy((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11.5, fontWeight: 600, padding: "2px 0" }}>
              {showHealthy ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {healthy.length} anúncio{healthy.length > 1 ? "s" : ""} saudável{healthy.length > 1 ? "is" : ""}
            </button>
            {showHealthy && healthy.map((a) => <Card key={a.adId} d={a} />)}
          </>
        )}
      </div>
    </div>
  );
}

function Pill({ color, text }: { color: string; text: string }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>{text}</span>;
}

function Card({ d }: { d: Diagnosis }) {
  const s = SEV[d.severity];
  const conf = CONF[d.confidence];
  return (
    <div style={{ borderRadius: 11, border: "1px solid var(--border)", borderLeft: `3px solid ${s.color}`, background: s.bg, padding: "11px 13px" }}>
      {/* Topo: anúncio + confiança */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <s.icon size={16} style={{ color: s.color, flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--text-primary)", minWidth: 0 }}>
              <Megaphone size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>{d.name}</span>
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{d.campaignName}</span>
            <span title={conf.label} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: conf.color }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: conf.color }} /> {conf.label}
            </span>
          </div>

          {/* Veredito + ação */}
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "6px 0 0", lineHeight: 1.35 }}>{d.title}</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", lineHeight: 1.45 }}>{d.action}</p>

          {/* Evidência (números que provam) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
            {d.evidence.map((e, i) => (
              <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap" }}>{e}</span>
            ))}
          </div>

          {/* Sinais secundários */}
          {d.signals.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
              {d.signals.map((sg, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: SEV[sg.severity].color, flexShrink: 0 }} /> {sg.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
