"use client";

import Link from "next/link";
import { useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { FunnelData, FunnelLead } from "@/lib/notifications/client-funnel";

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 18 };
const cap: React.CSSProperties = { fontSize: 12, color: "var(--p-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 };

export function PortalFunnel({ token, data }: { token: string; data: FunnelData | null }) {
  if (!data || data.total === 0) {
    return (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 22px" }}>
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
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 22px 56px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Funil de vendas</h1>
        <p style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 2 }}>Cada bolinha é um lead, posicionado na etapa em que está. A cor é a temperatura: frio → quente.</p>
      </div>

      {/* Resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Stat label="Leads no funil" value={String(data.total)} delta={c.deltaPct} deltaLabel="vs. mês passado" goodWhenUp />
        <Stat label="Taxa de conversão" value={`${data.overallConv}%`} sub={`${data.converted} convertido${data.converted !== 1 ? "s" : ""}`} accent />
        <Stat label="Gargalo" value={data.bottleneckLabel ?? "—"} sub="maior queda no funil" warn />
        <Stat label="Tempo de resposta" value={data.avgResponseMin != null ? `${data.avgResponseMin} min` : "—"} sub="média de 1ª resposta" />
      </div>

      {/* Mapa de calor lateral — leads plotados por etapa */}
      <div style={{ ...card, padding: "20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={cap}>❄️ Frio · recém-chegado</span>
          <span style={cap}>fechando · Quente 🔥</span>
        </div>

        {/* Clusters de leads (lateral) */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8, minWidth: 560, alignItems: "flex-end" }}>
            {data.stages.map((s) => (
              <div key={s.key} style={{ flex: 1, minWidth: 96, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Cluster stage={s} token={token} />
              </div>
            ))}
          </div>

          {/* Barra-gradiente contínua (a régua de temperatura) */}
          <div style={{ display: "flex", gap: 8, minWidth: 560, marginTop: 8 }}>
            <div style={{ flex: 1, height: 12, borderRadius: 7, background: "linear-gradient(90deg,#2563EB,#06B6D4,#EAB308,#F97316,#DC2626)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.12)" }} />
          </div>

          {/* Rótulos + conversão por etapa */}
          <div style={{ display: "flex", gap: 8, minWidth: 560, marginTop: 8 }}>
            {data.stages.map((s) => (
              <div key={s.key} style={{ flex: 1, minWidth: 96, textAlign: "center" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: s.isBottleneck ? "#DC2626" : "var(--p-text)" }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1.15 }}>{s.reached}</div>
                <div style={{ fontSize: 11, color: "var(--p-muted)" }}>
                  {s.convFromPrev != null ? `${s.convFromPrev}% avançaram` : "entrada"}
                  {s.isBottleneck && <span style={{ display: "block", color: "#DC2626", fontWeight: 700 }}>⚠ gargalo</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {data.lost > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--p-border)", fontSize: 12.5, color: "var(--p-muted)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#94A3B8" }} />
            <b style={{ color: "var(--p-text)" }}>{data.lost}</b> lead{data.lost !== 1 ? "s" : ""} perdido{data.lost !== 1 ? "s" : ""} ao longo do funil
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 12, textAlign: "center" }}>Toque numa bolinha para abrir a conversa do lead. Bolinhas maiores = leads mais recentes.</div>
      </div>
    </div>
  );
}

// Cluster de bolinhas (leads) de uma etapa — cresce de baixo pra cima conforme o volume.
function Cluster({ stage, token }: { stage: FunnelData["stages"][number]; token: string }) {
  const leads = stage.leads;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", alignContent: "flex-end", minHeight: 150, width: "100%" }}>
      {leads.length === 0 ? (
        <span style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--p-muted)" }}>—</span>
      ) : (
        leads.map((l) => <Dot key={l.contactId} lead={l} color={stage.color} token={token} />)
      )}
    </div>
  );
}

function Dot({ lead, color, token }: { lead: FunnelLead; color: string; token: string }) {
  // Tamanho por recência: lead mais novo = bolinha maior (mais "vivo").
  const size = lead.ageDays == null ? 17 : Math.max(13, 21 - Math.min(8, lead.ageDays));
  const stale = (lead.ageDays ?? 0) >= 3;
  return (
    <Link
      href={`/r/${token}/conversas`}
      title={`${lead.name}${lead.ageDays != null ? ` · ${lead.ageDays === 0 ? "hoje" : `há ${lead.ageDays}d`}` : ""}`}
      className="fdot"
      style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.5), fontWeight: 800, textDecoration: "none", border: "2px solid var(--p-surface)", boxShadow: stale ? "0 0 0 2px rgba(220,38,38,.5)" : "0 2px 5px rgba(0,0,0,.18)", flexShrink: 0 }}
    >
      {lead.name[0]?.toUpperCase()}
    </Link>
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
