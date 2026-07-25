"use client";

// ── Centro de Evolução (Camada de Inteligência) ────────────────────────────────
// Recomendações baseadas em EVIDÊNCIA + resumo das avaliações de conversa. O gestor
// vê, entende (drill-down até a conversa) e decide (aprovar/rejeitar/adiar/promover).
// Observacional: nada é aplicado na IA automaticamente. Ver docs/rfc-camada-inteligencia.md.

import { useEffect, useState, useCallback } from "react";
import { Brain, Check, X, Clock, Rocket, Loader2, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

interface Evidence { contactId?: string | null; excerpt: string }
interface Reco {
  id: string; type: string; title: string; targetComponent: string;
  evidence: Evidence[]; conversationCount: number; rate: number; confidence: number;
  expectedImpact: { reach: number; basis: string }; proposedChange: { summary: string }; status: string;
}
interface Evals { total: number; avgOverall: number | null; dimensions: { dimension: string; avg: number; n: number }[]; worst: { contactId: string; overall: number; turnCount: number }[] }

const COMP_LABEL: Record<string, string> = { catalogo: "Catálogo", playbook: "Playbook", conhecimento: "Conhecimento", politica: "Política", midia: "Mídia", ficha: "Ficha", preco: "Preço" };
const DIM_LABEL: Record<string, string> = { policy: "Políticas", handoff: "Handoff", missedOpportunity: "Oportunidade", quoteTiming: "Orçamento", discovery: "Descoberta", videoTiming: "Vídeo", conductionQuality: "Condução", dnaAdherence: "DNA de venda", discoveryQuality: "Descoberta (qualit.)" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function PortalCentroEvolucao({ token }: { token: string }) {
  const [recos, setRecos] = useState<Reco[]>([]);
  const [ev, setEv] = useState<Evals | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/${token}/recommendations`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setRecos(d?.recommendations ?? []); setEv(d?.evaluations ?? null);
    } catch { /* ignora */ } finally { setLoaded(true); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: string, reason?: string) {
    setBusy(id);
    try { await fetch(`/api/portal/${token}/recommendations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reason }) }); await load(); }
    finally { setBusy(null); }
  }

  const pend = recos.filter((r) => r.status === "pendente");
  const done = recos.filter((r) => r.status !== "pendente");

  const card: React.CSSProperties = { border: "1px solid var(--p-border, #e5e7eb)", borderRadius: 14, background: "var(--p-card, #fff)", padding: 16 };
  const badge = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color: fg });
  const scoreColor = (s: number) => (s >= 0.8 ? "#16a34a" : s >= 0.5 ? "#d97706" : "#dc2626");

  return (
    <section style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 8px", display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Brain size={20} style={{ color: "var(--p-accent, #6d28d9)" }} />
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Centro de Evolução</h1>
          <p style={{ fontSize: 12, opacity: 0.7, margin: "2px 0 0" }}>Recomendações baseadas em evidência das conversas. Você decide — nada é aplicado sozinho.</p>
        </div>
      </header>

      {/* Resumo das avaliações */}
      {ev && ev.total > 0 && (
        <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
          <div style={{ textAlign: "center", minWidth: 90 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: scoreColor(ev.avgOverall ?? 1), lineHeight: 1 }}>{ev.avgOverall != null ? pct(ev.avgOverall) : "—"}</div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>qualidade média<br />({ev.total} conversas)</div>
          </div>
          <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, display: "flex", alignItems: "center", gap: 5 }}><BarChart3 size={13} /> DIMENSÕES MAIS FRACAS</div>
            {ev.dimensions.slice(0, 4).map((d) => (
              <div key={d.dimension} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 130 }}>{DIM_LABEL[d.dimension] ?? d.dimension}</span>
                <div style={{ flex: 1, height: 7, background: "var(--p-border, #eee)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: pct(d.avg), height: "100%", background: scoreColor(d.avg) }} />
                </div>
                <span style={{ width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums", color: scoreColor(d.avg), fontWeight: 700 }}>{pct(d.avg)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendações pendentes */}
      {!loaded ? (
        <div style={{ ...card, textAlign: "center", opacity: 0.6 }}><Loader2 size={18} className="spin" /> carregando…</div>
      ) : pend.length === 0 ? (
        <div style={{ ...card, textAlign: "center", opacity: 0.7, fontSize: 13 }}>
          Ainda sem recomendações pendentes. Elas aparecem conforme as conversas são avaliadas — quanto mais conversas, mais evidência.
        </div>
      ) : (
        pend.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} style={card}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <span style={badge("var(--p-accent-soft, #ede9fe)", "var(--p-accent, #6d28d9)")}>{COMP_LABEL[r.targetComponent] ?? r.targetComponent}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>confiança <b style={{ color: scoreColor(r.confidence) }}>{pct(r.confidence)}</b></span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>alcance <b>{pct(r.expectedImpact?.reach ?? r.rate)}</b> das conversas</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{r.conversationCount} conversas · {r.evidence?.length ?? 0} evidências</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 6 }}><b>Sugestão:</b> {r.proposedChange?.summary}</div>

              {isOpen && (
                <div style={{ marginTop: 10, borderTop: "1px dashed var(--p-border,#e5e7eb)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>EVIDÊNCIA ({r.evidence?.length ?? 0})</div>
                  {(r.evidence ?? []).slice(0, 10).map((e, i) => (
                    <div key={i} style={{ fontSize: 12, opacity: 0.85, display: "flex", gap: 6 }}>
                      <span style={{ opacity: 0.5 }}>›</span>
                      <span>{e.contactId ? <a href={`/r/${token}/conversas?c=${e.contactId}`} style={{ color: "var(--p-accent,#6d28d9)" }}>abrir conversa</a> : null} {e.excerpt}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Impacto: {r.expectedImpact?.basis}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => act(r.id, "aprovar")} disabled={busy === r.id} style={{ ...badge("#16a34a", "#fff"), border: 0, cursor: "pointer", padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}><Check size={13} /> Aprovar</button>
                <button onClick={() => act(r.id, "promover")} disabled={busy === r.id} style={{ ...badge("var(--p-accent,#6d28d9)", "#fff"), border: 0, cursor: "pointer", padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}><Rocket size={13} /> Promovi (feito)</button>
                <button onClick={() => act(r.id, "adiar")} disabled={busy === r.id} style={{ ...badge("var(--p-border,#e5e7eb)", "var(--p-text,#111)"), border: 0, cursor: "pointer", padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}><Clock size={13} /> Adiar</button>
                <button onClick={() => act(r.id, "rejeitar")} disabled={busy === r.id} style={{ ...badge("transparent", "#dc2626"), border: "1px solid #dc2626", cursor: "pointer", padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}><X size={13} /> Rejeitar</button>
                <button onClick={() => setOpen(isOpen ? null : r.id)} style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", fontSize: 12, opacity: 0.7, display: "flex", alignItems: "center", gap: 4 }}>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} evidência
                </button>
              </div>
            </div>
          );
        })
      )}

      {done.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, opacity: 0.6, cursor: "pointer", padding: "4px 0" }}>Decididas ({done.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {done.map((r) => (
              <div key={r.id} style={{ ...card, padding: 10, fontSize: 12, opacity: 0.75, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={badge("var(--p-border,#eee)", "var(--p-text,#111)")}>{r.status}</span>
                <span>{r.title}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </section>
  );
}
