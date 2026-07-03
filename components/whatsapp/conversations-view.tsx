"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Loader2, Phone, Megaphone, Check, CheckCheck,
  MessageSquare, Sparkles, X, ChevronRight, ChevronLeft,
  Mic, Image, FileText, Video, Bot, BotOff, Trash2,
} from "lucide-react";
import { FUNNEL_LABELS } from "@/lib/wa-format";
import type { LeadBadge } from "@/lib/wa-leads";
import { MediaContent } from "@/components/whatsapp/wa-media";
import { LeadDetails } from "@/components/whatsapp/lead-details";
import { StatusBadge, TagChip } from "@/components/whatsapp/primitives/lead-badges";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConvRow {
  contactId: string; waId: string; name: string | null; displayName: string | null;
  lastMessageAt: string | null; lastText: string | null; lastDirection: string | null;
  fromAd: boolean; adTitle: string | null;
  reportValid: boolean; tags: { id: string; name: string; color: string }[]; badge: LeadBadge;
}
interface Msg {
  id: string; text: string | null; direction: string; type: string;
  timestamp: string; deliveredAt: string | null; readAt: string | null;
  filename?: string | null;
}
interface Detail {
  contact: { id: string; waId: string; name: string | null; aiSilenced?: boolean; aiOptedOut?: boolean };
  lead: { adTitle: string | null; adId?: string | null; enteredAt?: string | null; sourceType?: string | null } | null;
  funnelStage: string | null; items: Msg[];
  aiSummary: string | null; aiSuggestedStage: string | null;
  leadScore?: { score: number; temperature: string | null; qualified: boolean } | null;
}

const TEMP_META: Record<string, { label: string; color: string; emoji: string }> = {
  hot: { label: "Quente", color: "#EF4444", emoji: "🔥" },
  warm: { label: "Morno", color: "#F59E0B", emoji: "🌤️" },
  cold: { label: "Frio", color: "#3B82F6", emoji: "❄️" },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES = ["recebido","respondido","qualificado","negociacao","perdido","convertido"];
const STAGE_COLORS: Record<string, string> = {
  recebido: "#3B82F6", respondido: "#8B5CF6", qualificado: "#F59E0B",
  negociacao: "#10B981", convertido: "#16A34A", perdido: "#EF4444",
};
const AVATAR_PALETTE = ["#7C3AED","#3B82F6","#10B981","#F59E0B","#EF4444","#EC4899","#06B6D4","#8B5CF6","#0EA5E9","#D946EF"];
const MEDIA_TYPES = new Set(["image", "sticker", "audio", "video", "document"]);

// ─── Utils ────────────────────────────────────────────────────────────────────
function avatarColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h + ch.charCodeAt(0)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h];
}
function initials(name: string | null, wa: string) {
  const s = (name ?? wa).trim();
  return s.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function dayLabel(iso: string) {
  const d = new Date(iso); const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (same(d, today)) return "Hoje";
  if (same(d, yest)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
function msgTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function listTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso); const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function mediaIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    audio: <Mic size={11} />, image: <Image size={11} />,
    document: <FileText size={11} />, video: <Video size={11} />,
  };
  return map[type] ?? null;
}
function mediaLabel(type: string) {
  const map: Record<string, string> = {
    audio: "Áudio", image: "Imagem", document: "Documento", video: "Vídeo", sticker: "Figurinha",
  };
  return map[type] ?? type;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonConv() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)", alignItems: "center" }} className="wa-pulse">
      <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--bg-elevated)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ height: 12, borderRadius: 6, background: "var(--bg-elevated)", width: "55%" }} />
        <div style={{ height: 11, borderRadius: 6, background: "var(--bg-elevated)", width: "75%" }} />
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, wa, size = 46 }: { name: string | null; wa: string; size?: number }) {
  const color = avatarColor(wa || "x");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: Math.round(size * 0.34), fontWeight: 700, letterSpacing: "-0.5px",
      boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 20%, transparent)`,
    }}>
      {initials(name, wa)}
    </div>
  );
}

// ─── Panel card ───────────────────────────────────────────────────────────────
function PanelCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}


// ─── Main ─────────────────────────────────────────────────────────────────────
export function ConversationsView({ clientId, onFunnelChange }: { clientId: string; onFunnelChange?: () => void }) {
  const sp0 = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [list, setList] = useState<ConvRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [q, setQ] = useState(sp0.get("busca") ?? "");
  const [filter, setFilter] = useState<"all" | "ads">(sp0.get("origem") === "ads" ? "ads" : "all");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [ai, setAi] = useState<{ summary: string; suggestedStage: string | null } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [aiReplying, setAiReplying] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/whatsapp/conversations`);
    if (r.ok) setList(await r.json());
    setLoadingList(false);
  }, [clientId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadList(); }, [loadList]);

  // Filtros → URL (refresh-safe, compartilhável).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (q) sp.set("busca", q); else sp.delete("busca");
    if (filter === "ads") sp.set("origem", "ads"); else sp.delete("origem");
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, filter]);

  // Atualização automática da lista (novos leads/mensagens) sem recarregar a página.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) loadList(); }, 15000);
    return () => clearInterval(id);
  }, [loadList]);

  // Atualização silenciosa da conversa aberta (sem spinner).
  useEffect(() => {
    if (!selected) return;
    const id = setInterval(() => {
      if (document.hidden) return; // aba oculta → não consome
      fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Detail | null) => { if (d) setDetail(d); })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [clientId, selected]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingDetail(true); setDetail(null); setAi(null);
    fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Detail | null) => {
        if (!active) return;
        setDetail(d); setLoadingDetail(false);
        if (d?.aiSummary) setAi({ summary: d.aiSummary, suggestedStage: d.aiSuggestedStage });
      })
      .catch(() => active && setLoadingDetail(false));
    return () => { active = false; };
  }, [clientId, selected]);

  useEffect(() => {
    if (detail?.items.length) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [detail?.items.length]);

  async function summarize() {
    if (!selected || summarizing) return;
    setSummarizing(true);
    const r = await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}/summarize`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setSummarizing(false);
    if (r.ok) setAi({ summary: d.summary, suggestedStage: d.suggestedStage });
  }
  async function changeStage(value: string) {
    if (!selected) return;
    setDetail((d) => (d ? { ...d, funnelStage: value || null } : d));
    await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funnelStage: value || null }),
    });
    onFunnelChange?.();
  }
  // Operador assume/devolve o atendimento à IA neste contato.
  async function toggleSilence() {
    if (!selected || !detail) return;
    const next = !detail.contact.aiSilenced;
    setDetail((d) => (d ? { ...d, contact: { ...d.contact, aiSilenced: next } } : d));
    await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiSilenced: next }),
    });
  }
  // Gera a ficha do lead (handoff) e copia pro clipboard.
  async function genFicha() {
    if (!selected) return;
    const r = await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}/ficha`);
    const d = await r.json().catch(() => ({}));
    if (!d.ficha) { alert("Não foi possível gerar a ficha."); return; }
    try { await navigator.clipboard.writeText(d.ficha); alert("✅ Ficha copiada! Cole no grupo ou mande direto pro vendedor."); }
    catch { window.prompt("Copie a ficha:", d.ficha); }
  }
  // Aciona a IA manualmente pra responder o lead (ex: lead sem resposta, mesmo em horário
  // comercial). A IA responde a última mensagem do lead; ignora horário, respeita opt-out.
  async function aiReply() {
    if (!selected || aiReplying) return;
    setAiReplying(true);
    const r = await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}/ai-reply`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setAiReplying(false);
    if (!r.ok) { alert(d.error || "Não foi possível gerar a resposta da IA."); return; }
    const rr = await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`);
    const dd = await rr.json().catch(() => null);
    if (dd) setDetail(dd);
  }
  // LGPD — apaga o que a IA guardou deste contato (irreversível).
  async function eraseAi() {
    if (!selected) return;
    if (!confirm("Apagar os dados que a IA guardou deste contato (texto das interações e qualificação)? É irreversível e o contato deixa de receber mensagens automáticas.")) return;
    await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eraseAiData: true }),
    });
    setDetail((d) => (d ? { ...d, contact: { ...d.contact, aiOptedOut: true } } : d));
  }

  const filtered = useMemo(() => {
    let r = list;
    if (filter === "ads") r = r.filter((c) => c.fromAd);
    const term = q.trim().toLowerCase();
    if (term) r = r.filter((c) => (c.name ?? "").toLowerCase().includes(term) || c.waId.includes(term));
    return r;
  }, [list, q, filter]);

  const selectedConv = list.find((c) => c.contactId === selected);

  return (
    <>
      <style>{`
        @keyframes wa-spin { to { transform: rotate(360deg); } }
        .wa-spin { animation: wa-spin 1s linear infinite; }
        @keyframes wa-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .wa-pulse { animation: wa-pulse 1.5s ease-in-out infinite; }
        .wa-conv-row { transition: background 0.1s; }
        .wa-conv-row:hover { background: var(--bg-hover) !important; }
        .wa-btn-ghost { transition: opacity 0.12s; }
        .wa-btn-ghost:hover { opacity: 0.75; }
        /* Custom scrollbar */
        .wa-scroll::-webkit-scrollbar { width: 4px; }
        .wa-scroll::-webkit-scrollbar-track { background: transparent; }
        .wa-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--border) 80%, transparent); border-radius: 99px; }
      `}</style>

      <div style={{ display: "flex", height: "100%", minHeight: 0, border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(15,23,42,0.05)" }}>

        {/* ── LEFT: inbox ────────────────────────────────────────────────── */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", background: "var(--bg-surface)" }}>

          {/* Search bar */}
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, borderRadius: 12, background: "var(--bg-surface)", padding: "0 14px", border: "1px solid var(--border)" }}>
              <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar conversa..."
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text-primary)", fontSize: 13.5 }}
              />
              {q && <button onClick={() => setQ("")} className="wa-btn-ghost" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 0 }}><X size={13} /></button>}
            </div>
          </div>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            {(["all","ads"] as const).map((f) => {
              const count = f === "ads" ? list.filter((c) => c.fromAd).length : list.length;
              const active = filter === f;
              return (
                <button key={f} onClick={() => setFilter(f)} style={{
                  height: 28, padding: "0 12px", borderRadius: 99, border: active ? "none" : "1px solid var(--border)",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--text-secondary)",
                  fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                }}>
                  {f === "all" ? "Todas" : "Meta Ads"}
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: active ? "rgba(255,255,255,0.2)" : "var(--bg-elevated)", color: active ? "#fff" : "var(--text-muted)" }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Conversation list */}
          <div className="wa-scroll" style={{ flex: 1, overflowY: "auto" }}>
            {loadingList ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonConv key={i} />)
            ) : filtered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 20px", color: "var(--text-muted)" }}>
                <MessageSquare size={28} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Nenhuma conversa encontrada</p>
              </div>
            ) : filtered.map((c) => {
              const isSelected = selected === c.contactId;
              const isMedia = c.lastText?.startsWith("[") ?? false;
              const mIcon = isMedia && c.lastText ? mediaIcon(c.lastText.slice(1, -1).split(" ")[3] ?? "") : null;
              return (
                <button key={c.contactId} className="wa-conv-row" onClick={() => setSelected(c.contactId)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                    border: "none", cursor: "pointer", textAlign: "left",
                    background: isSelected ? "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))" : "transparent",
                    borderBottom: "1px solid var(--border)",
                    borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                  }}>
                  <Avatar name={c.displayName ?? c.name} wa={c.waId} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.displayName ?? c.name ?? `+${c.waId}`}</span>
                        <StatusBadge badge={c.badge} />
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, letterSpacing: "0.01em" }}>{listTime(c.lastMessageAt)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                      <span style={{ fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, display: "flex", alignItems: "center", gap: 4, fontStyle: isMedia ? "italic" : "normal" }}>
                        {c.lastDirection === "out" && <CheckCheck size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                        {mIcon}
                        {c.lastText ? (isMedia ? mediaLabel(c.lastText.replace(/[\[\]]/g, "")) : c.lastText) : <span style={{ opacity: 0.5 }}>—</span>}
                      </span>
                      <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {c.tags?.slice(0, 1).map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)}
                        {c.reportValid === false && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.1)", padding: "1px 6px", borderRadius: 99 }}>inválido</span>}
                        {c.fromAd && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "color-mix(in srgb, var(--accent) 10%, transparent)", borderRadius: 99, padding: "2px 7px" }}>
                            <Megaphone size={9} style={{ color: "var(--accent)" }} />
                            <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>Meta</span>
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CENTER: chat ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!selected ? (
            <EmptyState />
          ) : (
            <>
              {/* Chat header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", flexShrink: 0, boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <Avatar name={selectedConv?.displayName ?? detail?.contact.name ?? selectedConv?.name ?? null} wa={detail?.contact.waId ?? selectedConv?.waId ?? ""} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {detail?.contact.name ?? selectedConv?.name ?? `+${detail?.contact.waId ?? ""}`}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                        <Phone size={10} /> +{detail?.contact.waId ?? selectedConv?.waId}
                      </span>
                      {detail?.lead?.adTitle && (
                        <span style={{ fontSize: 11, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 3, background: "color-mix(in srgb, var(--accent) 8%, transparent)", padding: "1px 7px", borderRadius: 99 }}>
                          <Megaphone size={9} /> {detail.lead.adTitle}
                        </span>
                      )}
                      {detail?.funnelStage && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: STAGE_COLORS[detail.funnelStage] ?? "var(--text-muted)", background: `color-mix(in srgb, ${STAGE_COLORS[detail.funnelStage] ?? "#64748B"} 10%, transparent)`, padding: "1px 7px", borderRadius: 99 }}>
                          {FUNNEL_LABELS[detail.funnelStage]}
                        </span>
                      )}
                      {detail?.leadScore?.temperature && TEMP_META[detail.leadScore.temperature] && (
                        <span title={`Score de qualificação: ${detail.leadScore.score}/100`}
                          style={{ fontSize: 10.5, fontWeight: 700, color: TEMP_META[detail.leadScore.temperature].color, background: `color-mix(in srgb, ${TEMP_META[detail.leadScore.temperature].color} 12%, transparent)`, padding: "1px 7px", borderRadius: 99 }}>
                          {TEMP_META[detail.leadScore.temperature].emoji} {TEMP_META[detail.leadScore.temperature].label} · {detail.leadScore.score}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {!detail?.contact.aiOptedOut && (
                    <button onClick={aiReply} disabled={aiReplying} title="Fazer a IA responder o lead agora (mesmo em horário comercial)"
                      style={{ height: 32, display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 10, border: "1px solid var(--border)", cursor: aiReplying ? "wait" : "pointer", padding: "0 10px", fontSize: 12, fontWeight: 600, background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", opacity: aiReplying ? 0.6 : 1 }}>
                      <Sparkles size={14} /> {aiReplying ? "Respondendo…" : "IA responder"}
                    </button>
                  )}
                  <button onClick={genFicha} title="Gerar ficha do lead e copiar (handoff pro vendedor)"
                    style={{ height: 32, display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", padding: "0 10px", fontSize: 12, fontWeight: 600, background: "var(--accent)", color: "#fff" }}>
                    <FileText size={14} /> Ficha
                  </button>
                  {detail?.contact.aiOptedOut ? (
                    <span title="O lead pediu para não receber mensagens automáticas (opt-out)" style={{ height: 32, display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)", padding: "0 10px", fontSize: 12 }}>
                      <BotOff size={14} /> Opt-out
                    </span>
                  ) : (
                    <button onClick={toggleSilence}
                      title={detail?.contact.aiSilenced ? "IA silenciada neste contato — clique para devolver à IA" : "IA ativa neste contato — clique para assumir manualmente"}
                      style={{ height: 32, display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", padding: "0 10px", fontSize: 12, fontWeight: 600,
                        background: detail?.contact.aiSilenced ? "color-mix(in srgb, var(--red) 12%, transparent)" : "color-mix(in srgb, var(--green) 12%, transparent)",
                        color: detail?.contact.aiSilenced ? "var(--red)" : "var(--green)" }}>
                      {detail?.contact.aiSilenced ? <BotOff size={14} /> : <Bot size={14} />} {detail?.contact.aiSilenced ? "IA off" : "IA on"}
                    </button>
                  )}
                  <button onClick={eraseAi} title="LGPD: apagar dados que a IA guardou deste contato"
                    style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Trash2 size={14} />
                  </button>
                  <select value={detail?.funnelStage ?? ""} onChange={(e) => changeStage(e.target.value)}
                    style={{ height: 32, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 10px", fontSize: 12.5, outline: "none", cursor: "pointer" }}>
                    <option value="">Funil: —</option>
                    {STAGES.map((s) => <option key={s} value={s}>{FUNNEL_LABELS[s]}</option>)}
                  </select>
                  <button onClick={() => setRightOpen((v) => !v)} className="wa-btn-ghost"
                    style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {rightOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="wa-scroll" style={{
                flex: 1, overflowY: "auto", padding: "20px 5%",
                display: "flex", flexDirection: "column", gap: 2,
                // Fundo levemente esverdeado (sutil, lembra o WhatsApp).
                background: "color-mix(in srgb, #1FA855 5%, var(--bg-base))",
                backgroundImage: [
                  "radial-gradient(ellipse at 15% 40%, color-mix(in srgb, #1FA855 4%, transparent) 0%, transparent 55%)",
                  "radial-gradient(ellipse at 85% 70%, color-mix(in srgb, #1FA855 3%, transparent) 0%, transparent 45%)",
                  "radial-gradient(circle at 50% 10%, color-mix(in srgb, var(--border) 50%, transparent) 1px, transparent 1px)",
                ].join(", "),
                backgroundSize: "100% 100%, 100% 100%, 22px 22px",
              }}>
                {loadingDetail ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Loader2 size={22} className="wa-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                ) : !detail || detail.items.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-muted)" }}>
                    <MessageSquare size={28} style={{ opacity: 0.2 }} />
                    <p style={{ fontSize: 13, margin: 0 }}>Nenhuma mensagem registrada.</p>
                  </div>
                ) : (
                  detail.items.map((m, i) => {
                    const incoming = m.direction !== "out";
                    const prev = i > 0 ? detail.items[i - 1] : null;
                    const next = i < detail.items.length - 1 ? detail.items[i + 1] : null;
                    const showDay = !prev || dayLabel(prev.timestamp) !== dayLabel(m.timestamp);
                    // Grouping: same direction, same day, within 3 minutes
                    const sameAsPrev = prev && prev.direction === m.direction && !showDay && (new Date(m.timestamp).getTime() - new Date(prev.timestamp).getTime() < 180000);
                    const sameAsNext = next && next.direction === m.direction && dayLabel(next.timestamp) === dayLabel(m.timestamp) && (new Date(next.timestamp).getTime() - new Date(m.timestamp).getTime() < 180000);
                    const isFirstInGroup = !sameAsPrev;
                    const marginTop = showDay ? 0 : sameAsPrev ? 2 : 10;
                    const br = {
                      borderRadius: 16,
                      borderTopLeftRadius: incoming ? (isFirstInGroup ? 4 : 16) : 16,
                      borderTopRightRadius: !incoming ? (isFirstInGroup ? 4 : 16) : 16,
                      borderBottomLeftRadius: incoming && !sameAsNext ? 4 : 16,
                      borderBottomRightRadius: !incoming && !sameAsNext ? 4 : 16,
                    };
                    return (
                      <div key={m.id} style={{ marginTop }}>
                        {showDay && (
                          <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 14px" }}>
                            <span style={{ fontSize: 11.5, color: "var(--text-secondary)", background: "var(--bg-surface)", padding: "5px 16px", borderRadius: 99, border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(15,23,42,0.06)", fontWeight: 500 }}>
                              {dayLabel(m.timestamp)}
                            </span>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: incoming ? "flex-start" : "flex-end" }}>
                          {isFirstInGroup && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em", color: incoming ? "var(--text-muted)" : "#1FA855", margin: "0 6px 3px" }}>
                              {incoming ? "Lead" : "Loja"}
                            </span>
                          )}
                          <div style={{
                            maxWidth: "70%", padding: "8px 12px 6px",
                            background: incoming
                              ? "var(--bg-surface)"
                              : "color-mix(in srgb, #1FA855 16%, var(--bg-surface))",
                            border: incoming
                              ? "1px solid var(--border)"
                              : "1px solid color-mix(in srgb, #1FA855 22%, var(--border))",
                            boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
                            color: "var(--text-primary)",
                            fontSize: 13.5, lineHeight: 1.5,
                            ...br,
                          }}>
                            {MEDIA_TYPES.has(m.type) ? (
                              <MediaContent clientId={clientId} msgId={m.id} type={m.type} caption={m.text && !m.text.startsWith("[") ? m.text : null} filename={m.filename} />
                            ) : (
                              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</span>
                            )}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 4 }}>
                              <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{msgTime(m.timestamp)}</span>
                              {!incoming && (
                                m.readAt
                                  ? <CheckCheck size={13} style={{ color: "#34B7F1" }} />
                                  : m.deliveredAt
                                    ? <CheckCheck size={13} style={{ color: "var(--text-muted)" }} />
                                    : <Check size={13} style={{ color: "var(--text-muted)" }} />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Read-only bar */}
              <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--bg-elevated)" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                  🔒
                  <span>Espelhamento em tempo real · atendimento continua pelo WhatsApp Business no celular</span>
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: intelligence panel ──────────────────────────────────── */}
        {selected && rightOpen && (
          <div className="wa-scroll" style={{ width: 296, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--bg-elevated)", overflowY: "auto" }}>

            {/* Ficha de lead unificada (nome, tags, notas, funil, validação, origem) */}
            <LeadDetails clientId={clientId} contactId={selected} badge={selectedConv?.badge} showTimeline={false} onChanged={loadList} />

            {/* AI card */}
            <PanelCard icon={<Sparkles size={13} />} title="Inteligência IA">
              {!ai ? (
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
                    Resumo, intenção do lead e próximos passos.
                  </p>
                  <button onClick={summarize} disabled={summarizing}
                    style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 6%, transparent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: summarizing ? "default" : "pointer" }}>
                    {summarizing ? <><Loader2 size={13} className="wa-spin" /> Analisando...</> : <><Sparkles size={13} /> Gerar análise do lead</>}
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: "0 0 10px" }}>{ai.summary}</p>
                  {ai.suggestedStage && ai.suggestedStage !== detail?.funnelStage && (
                    <div style={{ background: "color-mix(in srgb, var(--accent) 6%, transparent)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                      <p style={{ fontSize: 11.5, color: "var(--text-secondary)", margin: "0 0 8px" }}>
                        Etapa sugerida: <strong style={{ color: STAGE_COLORS[ai.suggestedStage] ?? "var(--text-primary)" }}>{FUNNEL_LABELS[ai.suggestedStage] ?? ai.suggestedStage}</strong>
                      </p>
                      <button onClick={() => changeStage(ai.suggestedStage!)}
                        style={{ width: "100%", height: 30, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Aplicar etapa
                      </button>
                    </div>
                  )}
                  <button onClick={summarize} disabled={summarizing} className="wa-btn-ghost"
                    style={{ fontSize: 11.5, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Sparkles size={11} /> Atualizar análise
                  </button>
                </div>
              )}
            </PanelCard>

          </div>
        )}

      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
      color: "var(--text-muted)", background: "var(--bg-base)",
      backgroundImage: [
        "radial-gradient(circle at 50% 10%, color-mix(in srgb, var(--border) 50%, transparent) 1px, transparent 1px)",
      ].join(", "),
      backgroundSize: "22px 22px",
    }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--bg-surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
        <MessageSquare size={28} style={{ opacity: 0.25 }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 17, fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 6px" }}>Selecione uma conversa</p>
        <p style={{ fontSize: 13, margin: 0, color: "var(--text-muted)", maxWidth: 280, lineHeight: 1.5 }}>
          Escolha um lead na lista ao lado para visualizar o histórico e a origem da conversa.
        </p>
      </div>
    </div>
  );
}
