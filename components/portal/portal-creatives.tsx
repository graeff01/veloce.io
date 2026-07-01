"use client";

import { useState } from "react";

// ── Campanhas & criativos (portal do cliente) — versão CURADA ─────────────────
// O dono navega pelas campanhas e clica pra ver o criativo ampliado. Só mostra
// resultado (gasto/leads/CPL) e a imagem — nada de CTR/CPC/rankings/segmentação
// (isso é operação interna da agência).

export interface PortalCampaign { campaignId: string; name: string; status: string; spend: number; leads: number; cpl: number | null }
export interface PortalCreative { adId: string; name: string; campaignId: string; campaignName: string; thumbnailUrl: string | null; spend: number; leads: number }

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.045)" };
const cap: React.CSSProperties = { fontSize: 11, color: "var(--p-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 };

const int = (v: number) => v.toLocaleString("pt-BR");
function money(v: number, currency: string) {
  try { return v.toLocaleString("pt-BR", { style: "currency", currency }); } catch { return `${currency} ${v.toFixed(2)}`; }
}

function statusBadge(status: string): { label: string; color: string; bg: string } | null {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return { label: "Ativo", color: "#16a34a", bg: "rgba(22,163,74,.12)" };
  if (s.includes("PAUSED")) return { label: "Pausado", color: "var(--p-muted)", bg: "var(--p-bg)" };
  return null;
}

export function PortalCreatives({ campaigns, creatives, currency }: { campaigns: PortalCampaign[]; creatives: PortalCreative[]; currency: string }) {
  const [open, setOpen] = useState<PortalCreative | null>(null);

  if (campaigns.length === 0) {
    return (
      <div style={card}>
        <div style={cap}>Campanhas e criativos</div>
        <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 12 }}>Assim que houver campanhas ativas, elas aparecem aqui com os criativos.</div>
      </div>
    );
  }

  const byCamp = new Map<string, PortalCreative[]>();
  for (const cr of creatives) { const arr = byCamp.get(cr.campaignId) ?? []; arr.push(cr); byCamp.set(cr.campaignId, arr); }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={cap}>Campanhas e criativos</span>
        <span style={{ fontSize: 12, color: "var(--p-muted)" }}>toque num criativo para ampliar</span>
      </div>

      {campaigns.map((c) => {
        const badge = statusBadge(c.status);
        const crs = (byCamp.get(c.campaignId) ?? []).sort((a, b) => b.leads - a.leads || b.spend - a.spend);
        return (
          <div key={c.campaignId} style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--p-text)" }}>{c.name}</span>
              {badge && <span style={{ fontSize: 10.5, fontWeight: 700, color: badge.color, background: badge.bg, padding: "2px 8px", borderRadius: 99 }}>{badge.label}</span>}
              <span style={{ fontSize: 12, color: "var(--p-muted)", marginLeft: "auto" }}>{money(c.spend, currency)} · {int(c.leads)} lead{c.leads !== 1 ? "s" : ""}{c.cpl != null ? ` · ${money(c.cpl, currency)}/lead` : ""}</span>
            </div>

            {crs.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--p-muted)" }}>Sem criativos sincronizados nesta campanha.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10 }}>
                {crs.map((cr) => (
                  <button key={cr.adId} onClick={() => setOpen(cr)} style={{ padding: 0, border: "1px solid var(--p-border)", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "var(--p-bg)", textAlign: "left", display: "flex", flexDirection: "column" }}>
                    <div style={{ width: "100%", aspectRatio: "1 / 1", background: "var(--p-bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {cr.thumbnailUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={cr.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        : <span style={{ fontSize: 26 }}>📣</span>}
                    </div>
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{int(cr.leads)} lead{cr.leads !== 1 ? "s" : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Lightbox do criativo */}
      {open && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...card, maxWidth: 460, width: "100%", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ width: "100%", background: "var(--p-bg)", display: "flex", alignItems: "center", justifyContent: "center", maxHeight: "62vh", overflow: "hidden" }}>
              {open.thumbnailUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={open.thumbnailUrl} alt="" style={{ width: "100%", height: "auto", objectFit: "contain", display: "block" }} />
                : <span style={{ fontSize: 54, padding: 40 }}>📣</span>}
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--p-text)" }}>{open.campaignName}</div>
              <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 4 }}>{int(open.leads)} lead{open.leads !== 1 ? "s" : ""} · {money(open.spend, currency)} investidos</div>
              <button onClick={() => setOpen(null)} style={{ marginTop: 14, width: "100%", padding: "9px 0", borderRadius: 10, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
