"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ArrowLeft, Eye } from "lucide-react";

interface Row { contactId: string; name: string; lastText: string | null; lastType: string | null; lastDirection: string | null; lastMessageAt: string | null; fromAd: boolean; adTitle: string | null; funnelStage: string | null }
interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string }
interface Conv { contact: { name: string }; lead: { adTitle: string | null; adModel: string | null } | null; funnelStage: string | null; items: Msg[] }

const STAGE: Record<string, [string, string]> = {
  recebido: ["Recebido", "var(--wa-muted)"], respondido: ["Respondido", "#2563EB"], qualificado: ["Qualificado", "#2563EB"],
  negociacao: ["Negociação", "#7C3AED"], convertido: ["Convertido", "#16A34A"], perdido: ["Perdido", "#d6453d"],
};
function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const [label, color] = STAGE[stage] ?? [stage, "var(--wa-muted)"];
  return <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 16%, transparent)`, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{label}</span>;
}
const mediaLabel = (t: string) => ({ image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📎 Documento", sticker: "Figurinha", location: "📍 Localização" } as Record<string, string>)[t] ?? null;
const preview = (text: string | null, type: string | null) => (text && text.trim()) || (type ? mediaLabel(type) : null) || "—";
function hhmm(iso: string | null) { if (!iso) return ""; return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function listTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "HOJE";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "ONTEM";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
}
function avatarColor(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 42% 52%)`; }
function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: avatarColor(name || "?"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4 }}>{(name || "?")[0]?.toUpperCase()}</div>;
}

export function PortalConversations({ token, brandName, logoUrl }: { token: string; brandName: string; logoUrl: string | null }) {
  const [list, setList] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"all" | "ads">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);

  useEffect(() => { fetch(`/api/portal/${token}/conversations`).then((r) => (r.ok ? r.json() : [])).then((d) => setList(Array.isArray(d) ? d : [])); }, [token]);
  useEffect(() => {
    if (!sel) { setConv(null); return; }
    setLoadingConv(true);
    fetch(`/api/portal/${token}/conversations/${sel}`).then((r) => (r.ok ? r.json() : null)).then((d) => { setConv(d); setLoadingConv(false); });
  }, [sel, token]);

  const items = (list ?? []).filter((c) => (tab === "all" || c.fromAd) && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())));

  // agrupa mensagens por dia (divisores estilo WhatsApp)
  const grouped = useMemo(() => {
    const out: { day: string; msgs: Msg[] }[] = [];
    for (const m of conv?.items ?? []) {
      const day = dayLabel(m.timestamp);
      const last = out[out.length - 1];
      if (last && last.day === day) last.msgs.push(m); else out.push({ day, msgs: [m] });
    }
    return out;
  }, [conv]);

  const tabChip = (k: "all" | "ads", label: string) => (
    <button onClick={() => setTab(k)} style={{ padding: "5px 13px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, borderRadius: 20, background: tab === k ? "var(--p-accent-soft)" : "transparent", color: tab === k ? "var(--p-accent)" : "var(--wa-muted)" }}>{label}</button>
  );

  return (
    <div className="cdesk" style={{ flexDirection: "column", height: "100dvh", width: "100%" }}>
      {/* Topbar full-width — mantém a identidade do painel */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--p-border)", background: "var(--p-surface)", flexShrink: 0 }}>
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="" width={38} height={38} style={{ borderRadius: 10, objectFit: "cover", border: "1px solid var(--p-border)" }} />
          : <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--p-accent)", color: "var(--p-on-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>{brandName[0]?.toUpperCase()}</div>}
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--p-text)" }}>{brandName}</div>
          <div style={{ fontSize: 12, color: "var(--wa-muted)" }}>Conversas dos leads</div>
        </div>
        <span style={{ flex: 1 }} />
        <a href={`/r/${token}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-accent)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}><ArrowLeft size={15} /> Voltar ao painel</a>
      </header>

      {/* Viewer: lista | chat */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* ── Lista (sidebar) ── */}
      <aside style={{ width: 400, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--p-border)", background: "var(--p-surface)" }}>
        {/* busca */}
        <div style={{ padding: "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, background: "var(--p-bg)", border: "1px solid var(--p-border)" }}>
            <Search size={15} style={{ color: "var(--wa-muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar conversa" style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--p-text)", fontSize: 13.5 }} />
          </div>
        </div>
        {/* abas */}
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px", borderBottom: "1px solid var(--p-border)" }}>{tabChip("all", "Conversas")}{tabChip("ads", "Leads de anúncio")}</div>
        {/* rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {list === null ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)" }}>Carregando…</p>
            : items.length === 0 ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)" }}>{q ? "Nada encontrado." : tab === "ads" ? "Nenhum lead de anúncio." : "Nenhuma conversa."}</p>
            : items.map((c) => {
              const on = sel === c.contactId;
              return (
                <button key={c.contactId} onClick={() => setSel(c.contactId)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--p-border)", background: on ? "var(--p-accent-soft)" : "transparent", cursor: "pointer" }}>
                  <Avatar name={c.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--p-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: "var(--wa-muted)", whiteSpace: "nowrap" }}>{listTime(c.lastMessageAt)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12.5, color: "var(--wa-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastDirection === "out" ? "✓✓ " : ""}{preview(c.lastText, c.lastType)}</span>
                      {c.fromAd && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--p-accent)", background: "var(--p-accent-soft)", padding: "1px 6px", borderRadius: 20, letterSpacing: 0.3 }}>ADS</span>}
                      <StageBadge stage={c.funnelStage} />
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </aside>

      {/* ── Chat ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", background: "var(--wa-chat)" }}>
        {/* marca d'água: logo do cliente (PNG em /public/logopng) */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url("/logopng/bv.png")`, backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "min(38%, 300px)", opacity: 0.05, pointerEvents: "none", zIndex: 0 }} />
        {/* granulado (feTurbulence) — mesmo grão do tema claro */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, pointerEvents: "none", zIndex: 0, mixBlendMode: "multiply",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")` }} />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {!sel ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--wa-muted)" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "color-mix(in srgb, var(--p-accent) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Eye size={30} style={{ color: "var(--p-accent)" }} /></div>
            <p style={{ fontSize: 14 }}>Selecione uma conversa para ver o histórico</p>
          </div>
        ) : loadingConv || !conv ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--wa-muted)", fontSize: 13 }}>Carregando…</div>
        ) : (
          <>
            {/* header do chat */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 18px", background: "var(--p-surface)", borderBottom: "1px solid var(--p-border)", flexShrink: 0 }}>
              <Avatar name={conv.contact.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--p-text)" }}>{conv.contact.name}</div>
                {conv.lead?.adTitle && <div style={{ fontSize: 11.5, color: "var(--wa-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>veio do anúncio “{conv.lead.adTitle}”</div>}
              </div>
              <StageBadge stage={conv.funnelStage} />
            </div>

            {/* mensagens */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 8%" }}>
              {grouped.map((g, gi) => (
                <div key={gi}>
                  <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--wa-muted)", background: "var(--p-surface)", padding: "5px 12px", borderRadius: 8, boxShadow: "0 1px 1px rgba(0,0,0,.05)" }}>{g.day}</span>
                  </div>
                  {g.msgs.map((m) => {
                    const mine = m.direction === "out";
                    const body = (m.text && m.text.trim()) || mediaLabel(m.type) || "[mensagem]";
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 4 }}>
                        <div style={{ maxWidth: "65%", padding: "6px 9px 5px", fontSize: 13.5, lineHeight: 1.4, whiteSpace: "pre-wrap", boxShadow: "0 1px 1px rgba(0,0,0,.08)", position: "relative",
                          background: mine ? "var(--p-accent)" : "var(--wa-in)", color: mine ? "var(--p-on-accent)" : "var(--wa-text)",
                          borderRadius: mine ? "8px 0 8px 8px" : "0 8px 8px 8px" }}>
                          <span>{body}</span>
                          <span style={{ float: "right", fontSize: 10, opacity: 0.65, margin: "6px 0 -2px 8px", whiteSpace: "nowrap" }}>{hhmm(m.timestamp)}{mine ? " ✓✓" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* rodapé só-leitura (no lugar do campo de digitar) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px", background: "var(--p-surface)", borderTop: "1px solid var(--p-border)", color: "var(--wa-muted)", fontSize: 12, flexShrink: 0 }}>
              <Eye size={13} /> Somente leitura — você acompanha as conversas por aqui; responda pelo WhatsApp da loja.
            </div>
          </>
        )}
        </div>
      </main>
      </div>
    </div>
  );
}
