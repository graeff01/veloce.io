"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, MessageCircle, Loader2 } from "lucide-react";
import type { FunnelData } from "@/lib/notifications/client-funnel";

const STAGE_OPTS: [string, string][] = [["recebido", "Recebido"], ["respondido", "Respondido"], ["qualificado", "Qualificado"], ["negociacao", "Negociação"], ["convertido", "Convertido"], ["perdido", "Perdido"]];

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 18 };
const cap: React.CSSProperties = { fontSize: 12, color: "var(--p-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 };

export function PortalFunnel({ token, data }: { token: string; data: FunnelData | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  async function setStage(contactId: string, stage: string) {
    setBusy(contactId);
    try {
      await fetch(`/api/portal/${token}/funnel/${contactId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
      router.refresh();
    } catch { /* ignore */ }
    setBusy(null);
  }

  if (!data || data.total === 0) {
    return (
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "40px 22px" }}>
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
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 22px 56px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Funil de vendas</h1>
        <p style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 2 }}>A jornada dos leads na barra de temperatura: frio → quente. Abra cada etapa abaixo para ver os leads.</p>
      </div>

      {/* Resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Stat label="Leads no funil" value={String(data.total)} delta={c.deltaPct} deltaLabel="vs. mês passado" goodWhenUp />
        <Stat label="Taxa de conversão" value={`${data.overallConv}%`} sub={`${data.converted} convertido${data.converted !== 1 ? "s" : ""}`} accent />
        <Stat label="Gargalo" value={data.bottleneckLabel ?? "—"} sub="maior queda no funil" warn />
        <Stat label="Tempo de resposta" value={data.avgResponseMin != null ? `${data.avgResponseMin} min` : "—"} sub="média de 1ª resposta" />
      </div>

      {/* Barra de calor — largura = volume (afunilamento) */}
      <div style={{ ...card, padding: "20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={cap}>❄️ Frio · recém-chegado</span>
          <span style={cap}>fechando · Quente 🔥</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div className="heatbar" style={{ height: 26, borderRadius: 13, minWidth: 520, backgroundImage: "repeating-linear-gradient(110deg, rgba(255,255,255,0) 0px, rgba(255,255,255,.12) 40px, rgba(255,255,255,0) 80px), linear-gradient(90deg,#2563EB,#06B6D4,#EAB308,#F97316,#DC2626)", backgroundSize: "auto, 100% 100%", backgroundRepeat: "repeat, no-repeat", boxShadow: "inset 0 1px 3px rgba(0,0,0,.14)", animation: "heatShimmer 5s linear infinite" }} />

          <div style={{ display: "flex", marginTop: 10, minWidth: 520 }}>
            {data.stages.map((s) => (
              <div key={s.key} style={{ flex: 1, textAlign: "center", padding: "0 4px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: s.isBottleneck ? "#DC2626" : "var(--p-text)" }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1.2 }}>{s.reached}</div>
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
      </div>

      {/* Acordeão — leads por etapa (um por vez) */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--p-border)" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Leads por etapa</span>
          <span style={{ fontSize: 12.5, color: "var(--p-muted)", marginLeft: 8 }}>toque para abrir</span>
        </div>
        {data.stages.map((s) => {
          const isOpen = open === s.key;
          return (
            <div key={s.key} style={{ borderBottom: "1px solid var(--p-border)" }}>
              <button
                onClick={() => setOpen(isOpen ? null : s.key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", background: isOpen ? "var(--p-bg)" : "transparent", border: "none", cursor: "pointer", color: "var(--p-text)", textAlign: "left" }}
              >
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{s.label}</span>
                {s.avgStaleDays != null && s.currentCount > 0 && <span style={{ fontSize: 11.5, color: s.avgStaleDays >= 3 ? "#DC2626" : "var(--p-muted)", fontWeight: 600 }}>~{s.avgStaleDays}d parado</span>}
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--p-muted)" }}>{s.currentCount} {s.currentCount === 1 ? "lead" : "leads"}</span>
                <ChevronDown size={17} style={{ color: "var(--p-muted)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
              </button>

              {isOpen && (
                <div style={{ background: "var(--p-bg)", maxHeight: 320, overflowY: "auto" }}>
                  {s.leads.length === 0 ? (
                    <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--p-muted)" }}>Nenhum lead parado nesta etapa.</div>
                  ) : (
                    s.leads.map((l) => (
                      <div key={l.contactId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderTop: "1px solid var(--p-border)" }}>
                        <Link href={`/r/${token}/conversas?c=${l.contactId}`} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "var(--p-text)" }}>
                          <span style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: s.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>{l.name[0]?.toUpperCase()}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                            {l.evidence && <span style={{ display: "block", fontSize: 11.5, color: "var(--p-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.evidence}>“{l.evidence}”</span>}
                          </span>
                          {l.ageDays != null && <span style={{ fontSize: 12, color: l.ageDays >= 3 ? "#DC2626" : "var(--p-muted)", fontWeight: 600, flexShrink: 0 }}>{l.ageDays === 0 ? "hoje" : `há ${l.ageDays}d`}</span>}
                        </Link>
                        {busy === l.contactId ? (
                          <Loader2 size={15} style={{ color: "var(--p-muted)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                        ) : (
                          <>
                            {s.key !== "convertido" && (
                              <button onClick={() => setStage(l.contactId, "convertido")} title="Marcar este lead como vendido" style={{ flexShrink: 0, padding: "5px 9px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>✓ Vendido</button>
                            )}
                            <select value={s.key} onChange={(e) => setStage(l.contactId, e.target.value)} title="Mover etapa do lead" style={{ flexShrink: 0, fontSize: 11, padding: "5px 4px", borderRadius: 7, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--p-text)", cursor: "pointer" }}>
                              {STAGE_OPTS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
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
