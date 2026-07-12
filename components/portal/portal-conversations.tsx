"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ChangeEvent } from "react";
import { Search, Eye, Sparkles, Send, ArrowLeft } from "lucide-react";

interface Row { contactId: string; name: string; lastText: string | null; lastType: string | null; lastDirection: string | null; lastMessageAt: string | null; fromAd: boolean; adTitle: string | null; adModel: string | null; funnelStage: string | null }

// Rótulo do anúncio de origem (chave de agrupamento). Prioriza o modelo detectado.
const adLabelOf = (c: Row) => (c.adModel || c.adTitle || "Sem identificação").trim();
// "Aguardando resposta": a última mensagem foi do LEAD (entrada) e ninguém respondeu.
const isWaiting = (c: Row) => c.lastDirection != null && c.lastDirection !== "out";
interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string; aiGenerated?: boolean; pending?: boolean }
interface Conv { contact: { name: string }; lead: { adTitle: string | null; adModel: string | null; adBody: string | null; sourceUrl: string | null; image: string | null } | null; funnelStage: string | null; funnelEvidence: string | null; windowOpen?: boolean; lastInboundAt?: string | null; items: Msg[] }

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

export function PortalConversations({ token, brandName, logoUrl, initialContact }: { token: string; brandName: string; logoUrl: string | null; initialContact?: string | null }) {
  const [list, setList] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"all" | "ads" | "waiting">("all");
  const [adFilter, setAdFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(initialContact ?? null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [aiReplying, setAiReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const onScroll = () => { const el = scrollRef.current; if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };

  // Mobile-first: em telas estreitas vira 1 coluna (lista OU thread, com botão voltar).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Lista de conversas — carrega e AUTO-ATUALIZA (novos leads/mensagens sem F5).
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/portal/${token}/conversations`).then((r) => (r.ok ? r.json() : [])).then((d) => { if (alive) setList(Array.isArray(d) ? d : []); }).catch(() => {});
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 12000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  // Conversa aberta — carrega (com spinner) e AUTO-ATUALIZA em silêncio (novas mensagens).
  useEffect(() => {
    if (!sel) { setConv(null); return; }
    let alive = true;
    nearBottomRef.current = true; // ao abrir uma conversa, começa no fim
    setDraft(""); setSendError(null); // compositor limpo por conversa
    const load = (silent: boolean) => {
      if (!silent) setLoadingConv(true);
      return fetch(`/api/portal/${token}/conversations/${sel}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!alive) return;
        // Reconcilia: preserva bolhas otimistas ainda não confirmadas pelo servidor
        // (dedup por texto — se a real já chegou no polling, descarta a otimista).
        setConv((prev) => {
          if (!d) return silent ? prev : d;
          if (!prev) return d;
          const serverOut = new Set(d.items.filter((m: Msg) => m.direction === "out").map((m: Msg) => (m.text || "").trim()));
          const keptPending = prev.items.filter((m) => m.pending && !serverOut.has((m.text || "").trim()));
          return { ...d, items: [...d.items, ...keptPending] };
        });
        if (!silent) setLoadingConv(false);
      }).catch(() => { if (alive && !silent) setLoadingConv(false); });
    };
    load(false);
    const iv = setInterval(() => { if (!document.hidden) load(true); }, 7000);
    return () => { alive = false; clearInterval(iv); };
  }, [sel, token]);

  // Rola pro fim quando abre a conversa ou chega mensagem nova — mas só se já estava embaixo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [conv?.items?.length, sel]);

  // Anúncios distintos (para os filtros por anúncio), com contagem, do mais frequente.
  const adGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of list ?? []) if (c.fromAd) { const k = adLabelOf(c); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [list]);

  const items = (list ?? []).filter((c) => {
    if (tab === "ads" && !c.fromAd) return false;
    if (tab === "ads" && adFilter && adLabelOf(c) !== adFilter) return false;
    if (tab === "waiting" && !isWaiting(c)) return false;
    if (q.trim() && !c.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

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

  // Aciona a IA pra responder o lead a partir do portal (mesmo em horário comercial).
  // A IA só responde o que sabe; se for do vendedor, não envia e avisa.
  async function aiReply() {
    if (!sel || aiReplying) return;
    setAiReplying(true);
    try {
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/ai-reply`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Não foi possível gerar a resposta da IA."); return; }
      const rr = await fetch(`/api/portal/${token}/conversations/${sel}`);
      const dd = await rr.json().catch(() => null);
      if (dd) setConv(dd);
    } finally { setAiReplying(false); }
  }

  // Envio MANUAL da equipe (texto livre) pelo painel. Otimista: mostra a bolha na hora e
  // reconcilia com a mensagem real do servidor (dedup por id no polling). aiGenerated=false
  // → o backend aciona o takeover e pausa o bot.
  async function send() {
    const text = draft.trim();
    if (!sel || !text || sending || !conv?.windowOpen) return;
    setSending(true); setSendError(null);
    const optId = "opt-" + Date.now();
    const optimistic: Msg = { id: optId, text, direction: "out", type: "text", timestamp: new Date().toISOString(), aiGenerated: false, pending: true };
    nearBottomRef.current = true;
    setConv((c) => (c ? { ...c, items: [...c.items, optimistic] } : c));
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.message) {
        setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
        setDraft((cur) => cur || text); // devolve o texto pra não perder o que digitou
        setSendError(d?.error || "Não foi possível enviar a mensagem.");
        return;
      }
      // reconcilia a otimista pela mensagem real (id do banco → polling não duplica)
      setConv((c) => (c ? { ...c, items: c.items.map((m) => (m.id === optId ? (d.message as Msg) : m)) } : c));
    } catch {
      setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
      setDraft((cur) => cur || text);
      setSendError("Falha de conexão. Tente de novo.");
    } finally { setSending(false); }
  }

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };
  const onComposerInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // IA pausada: a última mensagem de saída foi da EQUIPE (humano) → o bot está em takeover.
  const iaPaused = (() => {
    for (let i = (conv?.items.length ?? 0) - 1; i >= 0; i--) {
      const m = conv!.items[i];
      if (m.direction === "out") return m.aiGenerated === false;
    }
    return false;
  })();

  const waitingCount = (list ?? []).filter(isWaiting).length;
  const tabChip = (k: "all" | "ads" | "waiting", label: string) => {
    const on = tab === k;
    const isWait = k === "waiting";
    return (
      <button onClick={() => { setTab(k); if (k !== "ads") setAdFilter(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, borderRadius: 20, background: on ? (isWait ? "color-mix(in srgb, #1FA855 15%, transparent)" : "var(--p-accent-soft)") : "transparent", color: on ? (isWait ? "#1FA855" : "var(--p-accent)") : "var(--wa-muted)" }}>
        {isWait && <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? "#1FA855" : "var(--wa-muted)" }} />}
        {label}
        {isWait && waitingCount > 0 && <span style={{ fontSize: 11, fontWeight: 800 }}>{waitingCount}</span>}
      </button>
    );
  };

  const adChip = (label: string | null, text: string, count: number) => {
    const on = adFilter === label;
    return (
      <button key={text} onClick={() => setAdFilter(label)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", border: `1px solid ${on ? "var(--p-accent)" : "var(--p-border)"}`, cursor: "pointer", fontSize: 12, fontWeight: 600, borderRadius: 20, whiteSpace: "nowrap", background: on ? "var(--p-accent-soft)" : "var(--p-bg)", color: on ? "var(--p-accent)" : "var(--p-text)" }}>
        {text} <span style={{ fontSize: 11, fontWeight: 700, color: on ? "var(--p-accent)" : "var(--wa-muted)" }}>{count}</span>
      </button>
    );
  };

  return (
    <div className="cdesk" style={{ flexDirection: "column", height: "100dvh", width: "100%" }}>
      {/* Topbar full-width — mantém a identidade do painel. No mobile some quando a thread abre (a thread tem header próprio com voltar). */}
      <header style={{ display: isMobile && sel ? "none" : "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--p-border)", background: "var(--p-surface)", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--p-text)" }}>Conversas dos leads</div>
      </header>

      {/* Viewer preenche toda a área interna (ao lado da sidebar do shell) */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
      <div style={{ width: "100%", height: "100%", display: "flex", minHeight: 0, overflow: "hidden", borderTop: "1px solid var(--p-border)" }}>
      {/* ── Lista (sidebar) ── */}
      <aside style={{ width: isMobile ? "100%" : 400, flexShrink: 0, display: isMobile && sel ? "none" : "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid var(--p-border)", background: "var(--p-surface)" }}>
        {/* busca */}
        <div style={{ padding: "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, background: "var(--p-bg)", border: "1px solid var(--p-border)" }}>
            <Search size={15} style={{ color: "var(--wa-muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar conversa" style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--p-text)", fontSize: 13.5 }} />
          </div>
        </div>
        {/* abas */}
        <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>{tabChip("all", "Conversas")}{tabChip("waiting", "Aguardando")}{tabChip("ads", "Leads de anúncio")}</div>
        {/* filtro por anúncio (só na aba de anúncios) */}
        {tab === "ads" && adGroups.length > 0 && (
          <div style={{ display: "flex", gap: 6, padding: "0 12px 9px", overflowX: "auto", borderBottom: "1px solid var(--p-border)" }}>
            {adChip(null, "Todos", adGroups.reduce((s, g) => s + g.count, 0))}
            {adGroups.map((g) => adChip(g.label, g.label, g.count))}
          </div>
        )}
        {(tab !== "ads" || adGroups.length === 0) && <div style={{ borderBottom: "1px solid var(--p-border)" }} />}
        {/* rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {list === null ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)" }}>Carregando…</p>
            : items.length === 0 ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)" }}>{q ? "Nada encontrado." : tab === "ads" ? "Nenhum lead de anúncio." : "Nenhuma conversa."}</p>
            : items.map((c) => {
              const on = sel === c.contactId;
              const waiting = isWaiting(c);
              return (
                <button key={c.contactId} onClick={() => setSel(c.contactId)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--p-border)", borderLeft: on ? "3px solid var(--p-accent)" : waiting ? "3px solid #1FA855" : "3px solid transparent", background: on ? "var(--p-accent-soft)" : waiting ? "color-mix(in srgb, #1FA855 5%, transparent)" : "transparent", cursor: "pointer" }}>
                  <Avatar name={c.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14.5, fontWeight: waiting ? 800 : 600, color: "var(--p-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ fontSize: 11, fontWeight: waiting ? 800 : 400, color: waiting ? "#1FA855" : "var(--wa-muted)", whiteSpace: "nowrap" }}>{listTime(c.lastMessageAt)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: waiting ? 700 : 400, color: waiting ? "var(--p-text)" : "var(--wa-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastDirection === "out" ? "✓✓ " : ""}{preview(c.lastText, c.lastType)}</span>
                      {waiting && <span title="Aguardando resposta" style={{ width: 9, height: 9, borderRadius: "50%", background: "#1FA855", boxShadow: "0 0 0 3px color-mix(in srgb, #1FA855 18%, transparent)", flexShrink: 0 }} />}
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
      <main style={{ flex: 1, display: isMobile && !sel ? "none" : "flex", flexDirection: "column", minWidth: 0, position: "relative", background: "var(--wa-chat)" }}>
        {/* marca d'água: logo do cliente (PNG em /public/logopng) */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url("/logopng/bv.png")`, backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "min(48%, 420px)", opacity: 0.06, pointerEvents: "none", zIndex: 0 }} />
        {/* granulado (feTurbulence) — mesmo grão do tema claro */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none", zIndex: 0, mixBlendMode: "multiply",
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "8px 12px calc(8px + env(safe-area-inset-top))" : "9px 18px", background: "var(--p-surface)", borderBottom: "1px solid var(--p-border)", flexShrink: 0 }}>
              {isMobile && (
                <button onClick={() => setSel(null)} aria-label="Voltar para a lista" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, marginLeft: -6, borderRadius: 10, border: "none", background: "transparent", color: "var(--p-text)", cursor: "pointer", flexShrink: 0 }}>
                  <ArrowLeft size={22} />
                </button>
              )}
              <Avatar name={conv.contact.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--p-text)" }}>{conv.contact.name}</div>
                {conv.lead?.adTitle && <div style={{ fontSize: 11.5, color: "var(--wa-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>veio do anúncio “{conv.lead.adTitle}”</div>}
              </div>
              <button onClick={aiReply} disabled={aiReplying} title="Fazer a IA responder o lead agora (mesmo em horário comercial)"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: 10, border: "1px solid var(--p-accent)", background: "var(--p-accent-soft)", color: "var(--p-accent)", fontSize: 12.5, fontWeight: 700, cursor: aiReplying ? "wait" : "pointer", opacity: aiReplying ? 0.6 : 1, whiteSpace: "nowrap" }}>
                <Sparkles size={14} /> {aiReplying ? "Respondendo…" : "IA responder"}
              </button>
              <StageBadge stage={conv.funnelStage} />
            </div>

            {/* Por que o lead está nesta etapa — a frase que a IA usou (transparência p/ o cliente). */}
            {conv.funnelEvidence && (
              <div style={{ padding: isMobile ? "6px 14px" : "6px 8%", fontSize: 11.5, color: "var(--wa-muted)", borderBottom: "1px solid var(--p-border)", lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700 }}>Por que nesta etapa:</span> “{conv.funnelEvidence}”
              </div>
            )}

            {/* mensagens */}
            <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 12px" : "16px 8%" }}>
              {/* Card do anúncio que originou o lead (estilo referral CTWA) */}
              {conv.lead && (conv.lead.image || conv.lead.adTitle) && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <a href={conv.lead.sourceUrl ?? undefined} target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: 0, maxWidth: 380, width: "100%", background: "var(--wa-in)", border: "1px solid var(--p-border)", borderRadius: 12, overflow: "hidden", textDecoration: "none", color: "var(--wa-text)", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
                    {conv.lead.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={conv.lead.image} alt="" style={{ width: 88, height: 88, objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--p-accent)", textTransform: "uppercase", letterSpacing: 0.4 }}>📣 Veio deste anúncio</div>
                      {conv.lead.adTitle && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{conv.lead.adTitle}</div>}
                      {conv.lead.adBody && <div style={{ fontSize: 11.5, color: "var(--wa-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lead.adBody}</div>}
                      {conv.lead.sourceUrl && <div style={{ fontSize: 11, color: "var(--p-accent)", marginTop: 4, fontWeight: 600 }}>ver anúncio →</div>}
                    </div>
                  </a>
                </div>
              )}
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
                        <div style={{ maxWidth: isMobile ? "82%" : "65%", padding: "6px 9px 5px", fontSize: 13.5, lineHeight: 1.4, whiteSpace: "pre-wrap", boxShadow: "0 1px 1px rgba(0,0,0,.08)", position: "relative", opacity: m.pending ? 0.75 : 1,
                          background: mine ? "var(--p-accent)" : "var(--wa-in)", color: mine ? "var(--p-on-accent)" : "var(--wa-text)",
                          borderRadius: mine ? "8px 0 8px 8px" : "0 8px 8px 8px" }}>
                          <span>{body}</span>
                          <span style={{ float: "right", fontSize: 10, opacity: 0.65, margin: "6px 0 -2px 8px", whiteSpace: "nowrap" }}>{mine && m.aiGenerated !== undefined ? (m.aiGenerated ? "IA · " : "Equipe · ") : ""}{hhmm(m.timestamp)}{m.pending ? " ⧗" : mine ? " ✓✓" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Compositor — a equipe responde o lead por texto livre daqui (dentro da janela de 24h). */}
            <div style={{ background: "var(--p-surface)", borderTop: "1px solid var(--p-border)", flexShrink: 0, padding: `8px 12px calc(8px + env(safe-area-inset-bottom))` }}>
              {iaPaused && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 2px 6px", fontSize: 11.5, color: "var(--wa-muted)" }}>
                  <Sparkles size={12} style={{ color: "var(--p-accent)" }} /> IA em pausa — sua equipe assumiu esta conversa.
                </div>
              )}
              {sendError && (
                <div role="alert" style={{ padding: "6px 10px", marginBottom: 6, fontSize: 12, borderRadius: 8, background: "color-mix(in srgb, #d6453d 12%, transparent)", color: "#d6453d" }}>{sendError}</div>
              )}
              {conv.windowOpen ? (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <textarea
                      ref={taRef}
                      value={draft}
                      onChange={onComposerInput}
                      onKeyDown={onComposerKey}
                      disabled={sending}
                      rows={1}
                      placeholder="Escreva uma mensagem para o lead…"
                      style={{ flex: 1, resize: "none", maxHeight: 120, minHeight: 40, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: 14, lineHeight: 1.35, outline: "none", fontFamily: "inherit" }}
                    />
                    <button onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="Enviar mensagem"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", cursor: sending || !draft.trim() ? "default" : "pointer", opacity: sending || !draft.trim() ? 0.55 : 1 }}>
                      <Send size={18} />
                    </button>
                  </div>
                  <div style={{ padding: "5px 2px 0", fontSize: 10.5, color: "var(--wa-muted)" }}>
                    Enter envia · Shift+Enter quebra linha · ao responder, a IA pausa e sua equipe assume.
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 4px", color: "var(--wa-muted)", fontSize: 12, lineHeight: 1.4 }}>
                  <Eye size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>A janela de 24h fechou — o lead precisa mandar uma mensagem para você poder responder por aqui. Você ainda pode acionar a ✨ IA acima.</span>
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </main>
      </div>
      </div>
    </div>
  );
}
