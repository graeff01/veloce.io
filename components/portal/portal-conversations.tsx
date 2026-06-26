"use client";

import { useEffect, useState } from "react";

interface Row { contactId: string; name: string; lastText: string | null; lastType: string | null; lastDirection: string | null; lastMessageAt: string | null; fromAd: boolean; adTitle: string | null; funnelStage: string | null }
interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string }
interface Conv { contact: { name: string }; lead: { adTitle: string | null; adModel: string | null } | null; funnelStage: string | null; items: Msg[] }

const STAGE: Record<string, [string, string]> = {
  recebido: ["Recebido", "var(--p-muted)"], respondido: ["Respondido", "#2563EB"], qualificado: ["Qualificado", "#2563EB"],
  negociacao: ["Negociação", "#7C3AED"], convertido: ["Convertido", "#16A34A"], perdido: ["Perdido", "#d6453d"],
};
function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const [label, color] = STAGE[stage] ?? [stage, "var(--p-muted)"];
  return <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, padding: "1px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>{label}</span>;
}
const mediaLabel = (t: string) => ({ image: "🖼️ Imagem", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📎 Documento", sticker: "Figurinha", location: "📍 Localização" } as Record<string, string>)[t] ?? null;
const preview = (text: string | null, type: string | null) => (text && text.trim()) || (type ? mediaLabel(type) : null) || "—";
function fmtTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function PortalConversations({ token, brandName }: { token: string; brandName: string }) {
  const [list, setList] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"all" | "ads">("all");
  const [sel, setSel] = useState<string | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);

  useEffect(() => { fetch(`/api/portal/${token}/conversations`).then((r) => (r.ok ? r.json() : [])).then((d) => setList(Array.isArray(d) ? d : [])); }, [token]);
  useEffect(() => {
    if (!sel) { setConv(null); return; }
    setLoadingConv(true);
    fetch(`/api/portal/${token}/conversations/${sel}`).then((r) => (r.ok ? r.json() : null)).then((d) => { setConv(d); setLoadingConv(false); });
  }, [sel, token]);

  const items = (list ?? []).filter((c) => tab === "all" || c.fromAd);
  const tabBtn = (k: "all" | "ads", label: string) => (
    <button onClick={() => setTab(k)} style={{ padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 500, borderRadius: 9, background: tab === k ? "var(--p-accent)" : "transparent", color: tab === k ? "var(--p-on-accent)" : "var(--p-muted)" }}>{label}</button>
  );

  return (
    <div className="cdesk" style={{ flexDirection: "column", height: "100dvh", width: "100%" }}>
      {/* Topbar */}
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid var(--p-border)", background: "var(--p-surface)", flexShrink: 0 }}>
        <a href={`/r/${token}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--p-accent)", textDecoration: "none", whiteSpace: "nowrap" }}>← Painel</a>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--p-text)", flex: 1 }}>{brandName} <span style={{ fontWeight: 500, color: "var(--p-muted)" }}>· Conversas</span></span>
        <div style={{ display: "flex", gap: 4, background: "var(--p-bg)", border: "1px solid var(--p-border)", borderRadius: 11, padding: 4 }}>
          {tabBtn("all", "Conversas")}{tabBtn("ads", "Leads de anúncio")}
        </div>
      </header>

      {/* Corpo: lista | mensagens */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Lista */}
        <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--p-border)", overflowY: "auto", background: "var(--p-surface)" }}>
          {list === null ? <p style={{ padding: 16, fontSize: 13, color: "var(--p-muted)" }}>Carregando…</p>
            : items.length === 0 ? <p style={{ padding: 16, fontSize: 13, color: "var(--p-muted)" }}>{tab === "ads" ? "Nenhum lead de anúncio." : "Nenhuma conversa."}</p>
            : items.map((c) => {
              const on = sel === c.contactId;
              return (
                <button key={c.contactId} onClick={() => setSel(c.contactId)} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--p-border)", background: on ? "var(--p-accent-soft)" : "transparent", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--p-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    {c.fromAd && <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--p-accent)", background: "var(--p-accent-soft)", padding: "1px 6px", borderRadius: 20 }}>ADS</span>}
                    <span style={{ fontSize: 10.5, color: "var(--p-muted)", whiteSpace: "nowrap" }}>{fmtTime(c.lastMessageAt)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 12, color: "var(--p-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastDirection === "out" ? "Você: " : ""}{preview(c.lastText, c.lastType)}</span>
                    <StageBadge stage={c.funnelStage} />
                  </div>
                </button>
              );
            })}
        </div>

        {/* Mensagens */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--p-bg)" }}>
          {!sel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p-muted)", fontSize: 13.5 }}>Selecione uma conversa pra ver o histórico.</div>
          ) : loadingConv || !conv ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p-muted)", fontSize: 13 }}>Carregando…</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid var(--p-border)", background: "var(--p-surface)", flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--p-text)" }}>{conv.contact.name}</span>
                {conv.lead?.adTitle && <span style={{ fontSize: 11, color: "var(--p-muted)" }}>· veio do anúncio “{conv.lead.adTitle}”</span>}
                <span style={{ flex: 1 }} />
                <StageBadge stage={conv.funnelStage} />
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {conv.items.map((m) => {
                  const mine = m.direction === "out";
                  const body = (m.text && m.text.trim()) || mediaLabel(m.type) || "[mensagem]";
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "72%", padding: "8px 11px", borderRadius: 12, fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", background: mine ? "var(--p-accent)" : "var(--p-surface)", color: mine ? "var(--p-on-accent)" : "var(--p-text)", border: mine ? "none" : "1px solid var(--p-border)" }}>
                        {body}
                        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: "right" }}>{fmtTime(m.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
