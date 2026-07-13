"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ChangeEvent } from "react";
import { Search, Eye, Sparkles, Send, ArrowLeft, MessageCircle, Clock, Megaphone, Paperclip, Camera, Mic, X, UserRound, Check } from "lucide-react";

interface Row { contactId: string; name: string; lastText: string | null; lastType: string | null; lastDirection: string | null; lastMessageAt: string | null; fromAd: boolean; adTitle: string | null; adModel: string | null; funnelStage: string | null; assignedEmail?: string | null; assignedName?: string | null }
interface Attendant { email: string; name: string }

// Rótulo do anúncio de origem (chave de agrupamento). Prioriza o modelo detectado.
const adLabelOf = (c: Row) => (c.adModel || c.adTitle || "Sem identificação").trim();
// "Aguardando resposta": a última mensagem foi do LEAD (entrada) e ninguém respondeu.
const isWaiting = (c: Row) => c.lastDirection != null && c.lastDirection !== "out";
interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string; aiGenerated?: boolean; pending?: boolean; sentByName?: string | null }
interface Conv { contact: { name: string }; lead: { adTitle: string | null; adModel: string | null; adBody: string | null; sourceUrl: string | null; image: string | null } | null; funnelStage: string | null; funnelEvidence: string | null; windowOpen?: boolean; lastInboundAt?: string | null; assignedEmail?: string | null; assignedName?: string | null; me?: string | null; meName?: string | null; attendants?: Attendant[]; items: Msg[] }

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
// Miniatura de imagem recebida (o lead mandou foto). Fallback pro rótulo se falhar.
function ThreadImage({ src, caption }: { src: string; caption: string | null }) {
  const [err, setErr] = useState(false);
  if (err) return <span>📷 Foto{caption ? ` · ${caption}` : ""}</span>;
  return (
    <a href={src} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Foto do lead" loading="lazy" onError={() => setErr(true)} style={{ maxWidth: 240, width: "100%", borderRadius: 9, display: "block" }} />
      {caption && caption.trim() && <span style={{ display: "block", marginTop: 5 }}>{caption}</span>}
    </a>
  );
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
  const [me, setMe] = useState<string | null>(null);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [ownerMenu, setOwnerMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream; mime: string; timer: ReturnType<typeof setInterval> } | null>(null);
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
    const load = () => fetch(`/api/portal/${token}/conversations`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive) return;
      const arr = Array.isArray(d) ? d : (d?.conversations ?? []);
      setList(arr);
      if (d && !Array.isArray(d)) { setMe(d.me ?? null); setAttendants(d.attendants ?? []); }
    }).catch(() => {});
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

  // A aba "Leads de anúncio" só aparece se o cliente REALMENTE tem leads de anúncio
  // (cliente que só usa a IA não vê um atalho vazio). Se sumir, volta pra "Conversas".
  const hasAds = adGroups.length > 0;
  useEffect(() => { if (!hasAds && (tab === "ads")) { setTab("all"); setAdFilter(null); } }, [hasAds, tab]);

  const items = (list ?? []).filter((c) => {
    if (mineOnly && (!me || c.assignedEmail !== me)) return false;
    if (tab === "ads" && !c.fromAd) return false;
    if (tab === "ads" && adFilter && adLabelOf(c) !== adFilter) return false;
    if (tab === "waiting" && !isWaiting(c)) return false;
    if (q.trim() && !c.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const myWaiting = (list ?? []).filter((c) => me && c.assignedEmail === me && isWaiting(c)).length;

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

  // Assumir/transferir/remover o dono do lead (atribuição).
  async function assign(email: string | null) {
    if (!sel || assigning) return;
    setAssigning(true); setOwnerMenu(false);
    try {
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Não foi possível atualizar o dono."); return; }
      const ae = d.assignedEmail ?? null;
      setConv((c) => (c ? { ...c, assignedEmail: ae, assignedName: ae ? (attendants.find((a) => a.email === ae)?.name || ae.split("@")[0]) : null } : c));
      // reflete na lista sem esperar o polling
      setList((l) => (l ? l.map((row) => (row.contactId === sel ? { ...row, assignedEmail: ae } : row)) : l));
    } finally { setAssigning(false); }
  }

  // Envio de MÍDIA (imagem/documento/áudio) — otimista + reconcile como o texto.
  async function sendMedia(kind: "image" | "audio" | "document", file: File, caption?: string) {
    if (!sel || sending || !conv?.windowOpen) return;
    setSending(true); setSendError(null);
    const optId = "opt-" + Date.now();
    const optimistic: Msg = { id: optId, text: caption || (kind === "document" ? file.name : null) || null, direction: "out", type: kind, timestamp: new Date().toISOString(), aiGenerated: false, pending: true };
    nearBottomRef.current = true;
    setConv((c) => (c ? { ...c, items: [...c.items, optimistic] } : c));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      if (caption) fd.append("caption", caption);
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/send-media`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.message) {
        setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
        setSendError(d?.error || "Não foi possível enviar o arquivo.");
        return;
      }
      setConv((c) => (c ? { ...c, items: c.items.map((m) => (m.id === optId ? (d.message as Msg) : m)) } : c));
    } catch {
      setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
      setSendError("Falha de conexão ao enviar o arquivo.");
    } finally { setSending(false); }
  }

  const onPickFile = (kind: "image" | "document") => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void sendMedia(kind, f);
  };

  // Gravação de áudio (voz) — MediaRecorder. iOS grava em audio/mp4 (aceito pela Cloud API).
  const pickAudioMime = (): string => {
    for (const c of ["audio/mp4", "audio/aac", "audio/mpeg", "audio/ogg;codecs=opus"]) {
      try { if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
    }
    return "";
  };
  function cleanupRec() {
    const r = recRef.current;
    if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); }
    recRef.current = null;
    setRecording(false); setRecSecs(0);
  }
  async function startRecording() {
    if (recording || sending || !sel || !conv?.windowOpen) return;
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      const timer = setInterval(() => setRecSecs((s) => s + 1), 1000);
      recRef.current = { mr, chunks, stream, mime: mr.mimeType || mime || "audio/mp4", timer };
      setRecSecs(0); setRecording(true);
      mr.start();
    } catch { setSendError("Não consegui acessar o microfone — verifique a permissão."); }
  }
  function cancelRecording() {
    const r = recRef.current;
    if (r) { try { r.mr.stop(); } catch { /* ignore */ } }
    cleanupRec();
  }
  function stopAndSendRecording() {
    const r = recRef.current;
    if (!r) return;
    const { mr, chunks, mime } = r;
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      cleanupRec();
      if (blob.size > 0) {
        const base = mime.split(";")[0];
        const ext = base.includes("mp4") ? "m4a" : base.includes("ogg") ? "ogg" : base.includes("mpeg") ? "mp3" : "m4a";
        void sendMedia("audio", new File([blob], `audio.${ext}`, { type: base }));
      }
    };
    try { mr.stop(); } catch { cleanupRec(); }
  }
  // Encerra o microfone se sair no meio da gravação.
  useEffect(() => () => { const r = recRef.current; if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); } }, []);

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

  // Item da barra flutuante inferior (mobile, estilo WhatsApp): ícone + rótulo, ativo destacado.
  const bottomItem = (k: "all" | "ads" | "waiting", label: string, icon: React.ReactNode, badge: number) => {
    const on = tab === k;
    return (
      <button key={k} onClick={() => { setTab(k); if (k !== "ads") setAdFilter(null); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "7px 4px", border: "none", cursor: "pointer", borderRadius: 16, background: on ? "color-mix(in srgb, var(--p-accent) 11%, transparent)" : "transparent", color: on ? "var(--p-accent)" : "var(--wa-muted)", transition: "color .2s ease, background .2s ease" }}>
        <span style={{ position: "relative", display: "inline-flex", opacity: on ? 1 : 0.75 }}>
          {icon}
          {badge > 0 && <span style={{ position: "absolute", top: -5, right: -10, minWidth: 15, height: 15, padding: "0 4px", borderRadius: 8, background: "#1FA855", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{badge > 99 ? "99+" : badge}</span>}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: "-0.01em" }}>{label}</span>
      </button>
    );
  };

  return (
    <div className="cdesk" style={{ flexDirection: "column", height: "100dvh", width: "100%" }}>
      <style>{`@keyframes portalBarUp{from{transform:translateY(150%);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes portalRecBlink{50%{opacity:.2}}`}</style>
      {/* Topbar full-width — mantém a identidade do painel. No mobile some quando a thread abre (a thread tem header próprio com voltar). */}
      <header style={{ display: isMobile && sel ? "none" : "flex", alignItems: "center", gap: 12, padding: isMobile ? "calc(12px + env(safe-area-inset-top)) 16px 12px" : "10px 20px", borderBottom: "1px solid var(--p-border)", background: "var(--p-surface)", flexShrink: 0 }}>
        <div style={{ fontSize: isMobile ? 18 : 15, fontWeight: 800, color: "var(--p-text)", letterSpacing: "-0.01em" }}>Conversas dos leads</div>
      </header>

      {/* Viewer preenche toda a área interna (ao lado da sidebar do shell) */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
      <div style={{ width: "100%", height: "100%", display: "flex", minHeight: 0, overflow: "hidden", borderTop: "1px solid var(--p-border)" }}>
      {/* ── Lista (sidebar) ── */}
      <aside style={{ width: isMobile ? "100%" : 400, flexShrink: 0, display: isMobile && sel ? "none" : "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid var(--p-border)", background: "var(--p-surface)" }}>
        {/* busca */}
        <div style={{ padding: isMobile ? "10px 14px" : "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: isMobile ? 46 : 38, padding: "0 12px", borderRadius: 12, background: "var(--p-bg)", border: "1px solid var(--p-border)" }}>
            <Search size={15} style={{ color: "var(--wa-muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar conversa" style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--p-text)", fontSize: isMobile ? 16 : 13.5 }} />
          </div>
        </div>
        {/* filtro "Meus leads" (só com login + equipe) */}
        {me && attendants.length > 1 && (
          <div style={{ padding: "0 14px 8px" }}>
            <button onClick={() => setMineOnly((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", border: `1px solid ${mineOnly ? "var(--p-accent)" : "var(--p-border)"}`, borderRadius: 20, cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: mineOnly ? "var(--p-accent-soft)" : "var(--p-bg)", color: mineOnly ? "var(--p-accent)" : "var(--p-text)" }}>
              <UserRound size={13} /> Meus leads {myWaiting > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#1FA855" }}>{myWaiting}</span>}
            </button>
          </div>
        )}
        {/* abas — no desktop ficam aqui em cima; no mobile viram a barra flutuante embaixo (estilo WhatsApp) */}
        {!isMobile && <div style={{ display: "flex", gap: 6, padding: "0 12px 8px", flexWrap: "wrap" }}>{tabChip("all", "Conversas")}{tabChip("waiting", "Aguardando")}{hasAds && tabChip("ads", "Leads de anúncio")}</div>}
        {/* filtro por anúncio (só na aba de anúncios) */}
        {tab === "ads" && adGroups.length > 0 && (
          <div style={{ display: "flex", gap: 6, padding: "0 12px 9px", overflowX: "auto", borderBottom: "1px solid var(--p-border)" }}>
            {adChip(null, "Todos", adGroups.reduce((s, g) => s + g.count, 0))}
            {adGroups.map((g) => adChip(g.label, g.label, g.count))}
          </div>
        )}
        {(tab !== "ads" || adGroups.length === 0) && <div style={{ borderBottom: "1px solid var(--p-border)" }} />}
        {/* rows */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: isMobile ? "calc(84px + env(safe-area-inset-bottom))" : 0 }}>
          {list === null ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)" }}>Carregando…</p>
            : items.length === 0 ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)" }}>{q ? "Nada encontrado." : tab === "ads" ? "Nenhum lead de anúncio." : "Nenhuma conversa."}</p>
            : items.map((c) => {
              const on = sel === c.contactId;
              const waiting = isWaiting(c);
              return (
                <button key={c.contactId} onClick={() => setSel(c.contactId)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: isMobile ? "13px 16px" : "10px 14px", border: "none", borderBottom: "1px solid var(--p-border)", borderLeft: on ? "3px solid var(--p-accent)" : waiting ? "3px solid #1FA855" : "3px solid transparent", background: on ? "var(--p-accent-soft)" : waiting ? "color-mix(in srgb, #1FA855 5%, transparent)" : "transparent", cursor: "pointer" }}>
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

        {/* Barra flutuante inferior (mobile) — estilo WhatsApp: vidro fosco, sutil, entra deslizando. Só na lista. */}
        {isMobile && (
          <nav style={{ position: "fixed", left: 16, right: 16, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 30, display: "flex", gap: 2, padding: 5, background: "color-mix(in srgb, var(--p-surface) 78%, transparent)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: "1px solid color-mix(in srgb, var(--p-border) 50%, transparent)", borderRadius: 22, boxShadow: "0 4px 20px rgba(0,0,0,.10)", animation: "portalBarUp .34s cubic-bezier(.22,1,.36,1) both" }}>
            {bottomItem("all", "Conversas", <MessageCircle size={20} />, 0)}
            {bottomItem("waiting", "Aguardando", <Clock size={20} />, waitingCount)}
            {hasAds && bottomItem("ads", "Anúncios", <Megaphone size={20} />, 0)}
          </nav>
        )}
      </aside>

      {/* ── Chat ── */}
      <main style={{ flex: 1, display: isMobile && !sel ? "none" : "flex", flexDirection: "column", minWidth: 0, position: "relative", background: "var(--wa-chat)" }}>
        {/* marca d'água: logo do PRÓPRIO cliente (via prop logoUrl; some se não tiver) */}
        {logoUrl && <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${logoUrl}")`, backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "min(48%, 420px)", opacity: 0.06, pointerEvents: "none", zIndex: 0 }} />}
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
              {/* Dono do lead (atribuição): assumir / transferir */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                {(() => { const mineOwner = !!me && conv.assignedEmail === me; const assigned = !!conv.assignedEmail; return (
                  <button onClick={() => setOwnerMenu((o) => !o)} disabled={assigning} title={assigned ? `Dono: ${conv.assignedName}` : "Sem dono — assumir/atribuir"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: isMobile ? "0 9px" : "0 11px", borderRadius: 10, border: `1px solid ${assigned ? (mineOwner ? "var(--p-accent)" : "var(--p-border)") : "var(--p-border)"}`, background: mineOwner ? "var(--p-accent-soft)" : "var(--p-bg)", color: mineOwner ? "var(--p-accent)" : assigned ? "var(--p-text)" : "var(--wa-muted)", fontSize: 12.5, fontWeight: 700, cursor: assigning ? "wait" : "pointer", whiteSpace: "nowrap", maxWidth: isMobile ? 120 : 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <UserRound size={14} style={{ flexShrink: 0 }} />{!isMobile && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{assigned ? (mineOwner ? "Você" : conv.assignedName) : "Assumir"}</span>}
                  </button>
                ); })()}
                {ownerMenu && (
                  <>
                    <div onClick={() => setOwnerMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div style={{ position: "absolute", right: 0, top: 38, zIndex: 41, width: 210, maxHeight: 260, overflowY: "auto", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.18)", padding: 6 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px" }}>Dono do lead</div>
                      {me && conv.assignedEmail !== me && (
                        <button onClick={() => assign(me)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--p-accent)" }}><UserRound size={14} /> Assumir (você)</button>
                      )}
                      {attendants.filter((a) => a.email !== me).map((a) => (
                        <button key={a.email} onClick={() => assign(a.email)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 8, fontSize: 13, color: "var(--p-text)" }}>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                          {conv.assignedEmail === a.email && <Check size={14} style={{ color: "var(--p-accent)" }} />}
                        </button>
                      ))}
                      {conv.assignedEmail && (
                        <button onClick={() => assign(null)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px", marginTop: 2, borderTop: "1px solid var(--p-border)", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "var(--wa-muted)" }}>Remover dono</button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <button onClick={aiReply} disabled={aiReplying} title="Fazer a IA responder o lead agora (mesmo em horário comercial)"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: isMobile ? "0 9px" : "0 12px", borderRadius: 10, border: "1px solid var(--p-accent)", background: "var(--p-accent-soft)", color: "var(--p-accent)", fontSize: 12.5, fontWeight: 700, cursor: aiReplying ? "wait" : "pointer", opacity: aiReplying ? 0.6 : 1, whiteSpace: "nowrap", flexShrink: 0 }}>
                <Sparkles size={14} /> {aiReplying ? "…" : isMobile ? "IA" : "IA responder"}
              </button>
              {!isMobile && <StageBadge stage={conv.funnelStage} />}
            </div>

            {/* Por que o lead está nesta etapa — a frase que a IA usou (transparência p/ o cliente). */}
            {conv.funnelEvidence && (
              <div style={{ padding: isMobile ? "8px 12px" : "8px 8%" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "8px 11px", borderRadius: 10, background: "color-mix(in srgb, var(--p-accent) 10%, var(--p-surface))", border: "1px solid color-mix(in srgb, var(--p-accent) 24%, transparent)", fontSize: 11.5, color: "var(--p-text)", lineHeight: 1.45 }}>
                  <Sparkles size={13} style={{ color: "var(--p-accent)", flexShrink: 0, marginTop: 1 }} />
                  <span><span style={{ fontWeight: 700, color: "var(--p-accent)" }}>Por que nesta etapa:</span> “{conv.funnelEvidence}”</span>
                </div>
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
                          {!mine && m.type === "image" && !m.pending
                            ? <ThreadImage src={`/api/portal/${token}/conversations/${sel}/media/${m.id}`} caption={m.text} />
                            : <span>{body}</span>}
                          <span style={{ float: "right", fontSize: 10, opacity: 0.65, margin: "6px 0 -2px 8px", whiteSpace: "nowrap" }}>{mine && m.aiGenerated !== undefined ? (m.aiGenerated ? "IA · " : `${m.sentByName || "Equipe"} · `) : ""}{hhmm(m.timestamp)}{m.pending ? " ⧗" : mine ? " ✓✓" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Compositor — a equipe responde o lead por texto livre daqui (dentro da janela de 24h). */}
            <div style={{ background: "var(--p-surface)", borderTop: "1px solid var(--p-border)", flexShrink: 0, padding: isMobile ? `10px 12px calc(18px + env(safe-area-inset-bottom))` : `8px 12px calc(8px + env(safe-area-inset-bottom))` }}>
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
                  <input ref={imgInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickFile("image")} />
                  <input ref={docInputRef} type="file" style={{ display: "none" }} onChange={onPickFile("document")} />
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                    {recording ? (
                      <>
                        <button onClick={cancelRecording} aria-label="Cancelar gravação" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "#d6453d", cursor: "pointer" }}>
                          <X size={22} />
                        </button>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 14px", borderRadius: 12, background: "var(--p-bg)", border: "1px solid var(--p-border)" }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#d6453d", animation: "portalRecBlink 1s steps(1) infinite", flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--p-text)", fontVariantNumeric: "tabular-nums" }}>{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}</span>
                          <span style={{ fontSize: 12, color: "var(--wa-muted)", marginLeft: "auto" }}>gravando áudio…</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <button onClick={() => docInputRef.current?.click()} disabled={sending} aria-label="Enviar documento" title="Enviar documento" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer" }}>
                          <Paperclip size={21} />
                        </button>
                        <button onClick={() => imgInputRef.current?.click()} disabled={sending} aria-label="Enviar imagem" title="Enviar imagem" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer" }}>
                          <Camera size={21} />
                        </button>
                        <textarea
                          ref={taRef}
                          value={draft}
                          onChange={onComposerInput}
                          onKeyDown={onComposerKey}
                          disabled={sending}
                          rows={1}
                          placeholder="Mensagem"
                          style={{ flex: 1, resize: "none", maxHeight: 120, minHeight: 44, padding: "11px 12px", borderRadius: 12, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: isMobile ? 16 : 14, lineHeight: 1.35, outline: "none", fontFamily: "inherit" }}
                        />
                      </>
                    )}
                    <button
                      onClick={() => { if (recording) stopAndSendRecording(); else if (draft.trim()) void send(); else void startRecording(); }}
                      disabled={sending}
                      aria-label={recording || draft.trim() ? "Enviar" : "Gravar áudio"}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0, borderRadius: "50%", border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", cursor: sending ? "default" : "pointer", opacity: sending ? 0.55 : 1 }}>
                      {recording || draft.trim() ? <Send size={18} /> : <Mic size={20} />}
                    </button>
                  </div>
                  {!isMobile && (
                    <div style={{ padding: "5px 2px 0", fontSize: 10.5, color: "var(--wa-muted)" }}>
                      Enter envia · Shift+Enter quebra linha · ao responder, a IA pausa e sua equipe assume.
                    </div>
                  )}
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
