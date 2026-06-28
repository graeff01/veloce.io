"use client";

import Link from "next/link";
import { useState } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, ChevronDown, MessageCircle } from "lucide-react";
import type { FunnelData } from "@/lib/notifications/client-funnel";

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 18 };
const cap: React.CSSProperties = { fontSize: 12, color: "var(--p-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 };

export function PortalFunnel({ token, data }: { token: string; data: FunnelData | null }) {
  const [open, setOpen] = useState<string | null>(null);

  if (!data || data.total === 0) {
    return (
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 22px" }}>
        <div style={{ ...card, textAlign: "center", padding: "56px 24px" }}>
          <div style={{ fontSize: 34 }}>🌡️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Seu funil aparece aqui</div>
          <div style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 6 }}>Assim que os leads chegarem pelo WhatsApp, eles vão preencher as etapas do funil.</div>
        </div>
      </div>
    );
  }

  const c = data.comparativo;
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 22px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Título */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Funil de vendas</h1>
        <p style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 2 }}>A jornada dos seus leads — da chegada à venda. As cores são a temperatura do lead: frio → quente.</p>
      </div>

      {/* Resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Stat label="Leads no funil" value={String(data.total)} delta={c.deltaPct} deltaLabel="vs. mês passado" goodWhenUp />
        <Stat label="Taxa de conversão" value={`${data.overallConv}%`} sub={`${data.converted} convertido${data.converted !== 1 ? "s" : ""}`} accent />
        <Stat label="Gargalo" value={data.bottleneckLabel ?? "—"} sub="maior queda no funil" warn />
        <Stat label="Tempo de resposta" value={data.avgResponseMin != null ? `${data.avgResponseMin} min` : "—"} sub="média de 1ª resposta" />
      </div>

      {/* Funil de calor */}
      <div style={{ ...card, padding: "22px 20px" }}>
        {data.stages.map((s, i) => {
          const width = 34 + s.pctOfTop * 0.66; // mín 34% → mantém legível e o afunilamento
          const expanded = open === s.key;
          return (
            <div key={s.key}>
              {/* Conector de conversão entre etapas */}
              {i > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "7px 0", fontSize: 12.5, fontWeight: 600, color: s.isBottleneck ? "#DC2626" : "var(--p-muted)" }}>
                  <ChevronDown size={15} />
                  {s.convFromPrev != null ? `${s.convFromPrev}% avançaram` : "—"}
                  {s.isBottleneck && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(220,38,38,.12)", color: "#DC2626", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}><AlertTriangle size={11} /> gargalo</span>}
                </div>
              )}

              {/* Faixa de calor (clicável) */}
              <button
                onClick={() => setOpen(expanded ? null : s.key)}
                style={{ display: "flex", justifyContent: "center", width: "100%", border: "none", background: "none", cursor: "pointer", padding: 0 }}
              >
                <div
                  style={{
                    width: `${width}%`, minWidth: 240, borderRadius: 13, padding: "14px 18px",
                    background: `linear-gradient(100deg, ${s.color}, ${s.color}cc)`,
                    boxShadow: `0 6px 18px ${s.color}40`,
                    transformOrigin: "center", animation: "fGrow .5s cubic-bezier(.22,1,.36,1) both", animationDelay: `${i * 70}ms`,
                    outline: s.isBottleneck ? "2px solid rgba(220,38,38,.55)" : "none", outlineOffset: 2,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, color: "#fff" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, textShadow: "0 1px 2px rgba(0,0,0,.18)" }}>{s.label}</span>
                    <span style={{ fontSize: 20, fontWeight: 900, textShadow: "0 1px 2px rgba(0,0,0,.18)" }}>{s.reached}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 3, color: "rgba(255,255,255,.92)", fontSize: 11.5, fontWeight: 600 }}>
                    <span>{s.pctOfTop}% do topo · {s.currentCount} aqui agora{s.avgStaleDays != null ? ` · ~${s.avgStaleDays}d parado` : ""}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.95 }}><ChevronDown size={13} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> {s.currentCount > 0 ? "ver leads" : ""}</span>
                  </div>
                </div>
              </button>

              {/* Leads desta etapa (v2) */}
              {expanded && (
                <div style={{ border: "1px solid var(--p-border)", borderRadius: 12, marginTop: 8, overflow: "hidden", background: "var(--p-bg)" }}>
                  {s.leads.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--p-muted)" }}>Nenhum lead parado nesta etapa.</div>
                  ) : (
                    s.leads.map((l) => (
                      <Link key={l.contactId} href={`/r/${token}/conversas`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--p-border)", textDecoration: "none", color: "var(--p-text)" }}>
                        <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: s.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{l.name[0]?.toUpperCase()}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                        {l.ageDays != null && <span style={{ fontSize: 12, color: l.ageDays >= 3 ? "#DC2626" : "var(--p-muted)", fontWeight: 600 }}>{l.ageDays === 0 ? "hoje" : `há ${l.ageDays}d`}</span>}
                        <MessageCircle size={15} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Vazamento (perdidos) */}
        {data.lost > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--p-border)", fontSize: 12.5, color: "var(--p-muted)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#94A3B8" }} />
            <b style={{ color: "var(--p-text)" }}>{data.lost}</b> lead{data.lost !== 1 ? "s" : ""} perdido{data.lost !== 1 ? "s" : ""} ao longo do funil
          </div>
        )}
      </div>

      {/* Legenda — escala de calor */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={cap}>Temperatura do lead</span>
        <div style={{ flex: 1, minWidth: 200, height: 10, borderRadius: 6, background: "linear-gradient(90deg,#2563EB,#06B6D4,#EAB308,#F97316,#DC2626)" }} />
        <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--p-muted)" }}>
          <span>❄️ Frio (recém-chegado)</span><span>🔥 Quente (fechando)</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, delta, deltaLabel, goodWhenUp, accent, warn }: { label: string; value: string; sub?: string; delta?: number | null; deltaLabel?: string; goodWhenUp?: boolean; accent?: boolean; warn?: boolean }) {
  const up = (delta ?? 0) >= 0;
  const dColor = delta == null ? "var(--p-muted)" : goodWhenUp === undefined ? "var(--p-muted)" : up === goodWhenUp ? "#16A34A" : "#DC2626";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div style={card}>
      <div style={cap}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, marginTop: 7, color: accent ? "var(--p-accent)" : warn ? "#D97706" : "var(--p-text)" }}>{value}</div>
      {delta != null ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: dColor, marginTop: 6 }}>
          <Icon size={12} /> {up ? "+" : ""}{delta}% <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>{deltaLabel}</span>
        </div>
      ) : sub ? (
        <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 6 }}>{sub}</div>
      ) : null}
    </div>
  );
}
