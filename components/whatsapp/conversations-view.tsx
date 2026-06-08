"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Loader2, Phone, Megaphone, Check, CheckCheck,
  MessageSquare, Sparkles, X, ChevronRight, ChevronLeft,
  Calendar, Tag, Info, Mic, Image, FileText, Video,
} from "lucide-react";
import { timeAgo, FUNNEL_LABELS } from "@/lib/wa-format";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConvRow {
  contactId: string; waId: string; name: string | null;
  lastMessageAt: string | null; lastText: string | null; lastDirection: string | null;
  fromAd: boolean; adTitle: string | null;
}
interface Msg {
  id: string; text: string | null; direction: string; type: string;
  timestamp: string; deliveredAt: string | null; readAt: string | null;
}
interface Detail {
  contact: { id: string; waId: string; name: string | null };
  lead: { adTitle: string | null; adId?: string | null; enteredAt?: string | null; sourceType?: string | null } | null;
  funnelStage: string | null; items: Msg[];
  aiSummary: string | null; aiSuggestedStage: string | null;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#7C3AED","#3B82F6","#10B981","#F59E0B","#EF4444","#EC4899","#06B6D4","#8B5CF6"];
function avatarColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
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
function mediaPreview(type: string, text: string | null) {
  if (text && !text.startsWith("[")) return text;
  const map: Record<string, { icon: React.ReactNode; label: string }> = {
    audio:    { icon: <Mic size={11} />,      label: "Áudio" },
    image:    { icon: <Image size={11} />,    label: "Imagem" },
    document: { icon: <FileText size={11} />, label: "Documento" },
    video:    { icon: <Video size={11} />,    label: "Vídeo" },
  };
  const m = map[type];
  if (!m) return text ?? `[${type}]`;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{m.icon}{m.label}</span>;
}

const STAGES = ["recebido","respondido","qualificado","negociacao","perdido","convertido"];

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--wa-border)" }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--wa-skeleton)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ height: 13, borderRadius: 4, background: "var(--wa-skeleton)", width: "60%" }} />
        <div style={{ height: 11, borderRadius: 4, background: "var(--wa-skeleton)", width: "80%" }} />
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, wa, size = 46 }: { name: string | null; wa: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: avatarColor(wa || "x"),
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: size * 0.35, fontWeight: 600, letterSpacing: "-0.5px",
    }}>
      {initials(name, wa)}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function ConversationsView({ clientId, onFunnelChange }: { clientId: string; onFunnelChange?: () => void }) {
  const [list, setList] = useState<ConvRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "ads">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [ai, setAi] = useState<{ summary: string; suggestedStage: string | null } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/whatsapp/conversations`);
    if (r.ok) setList(await r.json());
    setLoadingList(false);
  }, [clientId]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoadingDetail(true);
    setDetail(null);
    setAi(null);
    fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Detail | null) => {
        if (!active) return;
        setDetail(d);
        setLoadingDetail(false);
        if (d?.aiSummary) setAi({ summary: d.aiSummary, suggestedStage: d.aiSuggestedStage });
      })
      .catch(() => active && setLoadingDetail(false));
    return () => { active = false; };
  }, [clientId, selected]);

  useEffect(() => {
    if (detail?.items.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
        :root {
          --wa-bg-left: var(--bg-surface);
          --wa-bg-header: var(--bg-elevated);
          --wa-bg-search: var(--bg-base);
          --wa-bg-chat: var(--bg-base);
          --wa-bg-bubble-in: var(--bg-surface);
          --wa-bg-bubble-out: color-mix(in srgb, var(--accent) 15%, var(--bg-surface));
          --wa-border: var(--border);
          --wa-text-primary: var(--text-primary);
          --wa-text-secondary: var(--text-secondary);
          --wa-text-meta: var(--text-muted);
          --wa-selected: var(--bg-hover);
          --wa-hover: var(--bg-hover);
          --wa-skeleton: var(--bg-elevated);
          --wa-unread: var(--accent);
          --wa-right: var(--bg-elevated);
        }
        .wa-conv-item { transition: background 0.12s; }
        .wa-conv-item:hover { background: var(--wa-hover) !important; }
        .wa-filter-pill { transition: all 0.15s; cursor: pointer; }
        .wa-filter-pill:hover { opacity: 0.85; }
        .wa-summarize-btn { transition: opacity 0.15s; }
        .wa-summarize-btn:hover { opacity: 0.85; }
        @keyframes wa-spin { to { transform: rotate(360deg); } }
        .wa-spin { animation: wa-spin 1s linear infinite; }
        @keyframes wa-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .wa-pulse { animation: wa-pulse 1.5s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", height: "100%", minHeight: 0, border: "1px solid var(--wa-border)", borderRadius: 14, overflow: "hidden" }}>

        {/* ── LEFT: conversation list ────────────────────────────────────── */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--wa-border)", background: "var(--wa-bg-left)" }}>

          {/* Search */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--wa-border)", background: "var(--wa-bg-header)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, borderRadius: 20, background: "var(--wa-bg-search)", padding: "0 14px", border: "1px solid var(--wa-border)" }}>
              <Search size={14} style={{ color: "var(--wa-text-meta)", flexShrink: 0 }} />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar ou começar uma nova conversa"
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--wa-text-primary)", fontSize: 13.5 }}
              />
              {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--wa-text-meta)", display: "flex", padding: 0 }}><X size={14} /></button>}
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--wa-border)", background: "var(--wa-bg-header)" }}>
            {(["all", "ads"] as const).map((f) => (
              <button key={f} className="wa-filter-pill" onClick={() => setFilter(f)} style={{
                height: 26, padding: "0 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
                background: filter === f ? "var(--accent)" : "var(--wa-bg-search)",
                color: filter === f ? "#fff" : "var(--wa-text-secondary)",
              }}>
                {f === "all" ? "Todas" : "Anúncios"}
                {f === "ads" && list.filter((c) => c.fromAd).length > 0 && (
                  <span style={{ marginLeft: 5, background: filter === "ads" ? "rgba(255,255,255,0.25)" : "var(--accent)", color: "#fff", borderRadius: 10, fontSize: 10, padding: "0 5px" }}>
                    {list.filter((c) => c.fromAd).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingList ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : filtered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: "var(--wa-text-meta)" }}>
                <MessageSquare size={28} style={{ opacity: 0.3 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Nenhuma conversa encontrada</p>
              </div>
            ) : filtered.map((c) => {
              const isSelected = selected === c.contactId;
              return (
                <button key={c.contactId} className="wa-conv-item" onClick={() => setSelected(c.contactId)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", cursor: "pointer", textAlign: "left", background: isSelected ? "var(--wa-selected)" : "transparent", borderBottom: "1px solid var(--wa-border)" }}>
                  <Avatar name={c.name} wa={c.waId} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--wa-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                        {c.name ?? `+${c.waId}`}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--wa-text-meta)", flexShrink: 0 }}>{listTime(c.lastMessageAt)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                      <span style={{ fontSize: 12.5, color: "var(--wa-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                        {c.lastDirection === "out" && <CheckCheck size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                        {c.lastText ? mediaPreview("text", c.lastText) : <span style={{ fontStyle: "italic" }}>—</span>}
                      </span>
                      {c.fromAd && (
                        <span title={c.adTitle ?? "Lead de anúncio"} style={{ flexShrink: 0, display: "flex", alignItems: "center", background: "color-mix(in srgb, var(--accent) 12%, transparent)", borderRadius: 10, padding: "1px 6px", gap: 3 }}>
                          <Megaphone size={9} style={{ color: "var(--accent)" }} />
                          <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 500 }}>anúncio</span>
                        </span>
                      )}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--wa-border)", background: "var(--wa-bg-header)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <Avatar name={detail?.contact.name ?? selectedConv?.name ?? null} wa={detail?.contact.waId ?? selectedConv?.waId ?? ""} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "var(--wa-text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {detail?.contact.name ?? selectedConv?.name ?? `+${detail?.contact.waId ?? ""}`}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--wa-text-meta)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <Phone size={10} />
                      +{detail?.contact.waId ?? selectedConv?.waId}
                      {detail?.lead?.adTitle && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--accent)" }}>
                          · <Megaphone size={10} /> {detail.lead.adTitle}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <select value={detail?.funnelStage ?? ""} onChange={(e) => changeStage(e.target.value)}
                    style={{ height: 32, borderRadius: 8, border: "1px solid var(--wa-border)", background: "var(--wa-bg-search)", color: "var(--wa-text-primary)", padding: "0 10px", fontSize: 12.5, outline: "none", cursor: "pointer" }}>
                    <option value="">Funil: —</option>
                    {STAGES.map((s) => <option key={s} value={s}>{FUNNEL_LABELS[s]}</option>)}
                  </select>
                  <button onClick={() => setRightOpen((v) => !v)} title={rightOpen ? "Fechar painel" : "Abrir painel"} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--wa-border)", background: "var(--wa-bg-search)", color: "var(--wa-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {rightOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{
                flex: 1, overflowY: "auto", padding: "16px 8%", display: "flex", flexDirection: "column", gap: 2,
                background: "var(--wa-bg-chat)",
                backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--border) 60%, transparent) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}>
                {loadingDetail ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Loader2 size={22} className="wa-spin" style={{ color: "var(--wa-text-meta)" }} />
                  </div>
                ) : !detail || detail.items.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--wa-text-meta)", textAlign: "center", marginTop: 32 }}>Nenhuma mensagem registrada.</p>
                ) : (
                  detail.items.map((m, i) => {
                    const incoming = m.direction !== "out";
                    const prev = detail.items[i - 1];
                    const showDay = !prev || dayLabel(prev.timestamp) !== dayLabel(m.timestamp);
                    const isMedia = !m.text || m.text.startsWith("[");
                    return (
                      <div key={m.id}>
                        {showDay && (
                          <div style={{ display: "flex", justifyContent: "center", margin: "14px 0 10px" }}>
                            <span style={{ fontSize: 11.5, color: "var(--wa-text-secondary)", background: "var(--wa-bg-left)", padding: "4px 14px", borderRadius: 20, border: "1px solid var(--wa-border)", fontWeight: 500 }}>
                              {dayLabel(m.timestamp)}
                            </span>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: incoming ? "flex-start" : "flex-end", marginBottom: 1 }}>
                          <div style={{
                            maxWidth: "68%", padding: "7px 11px 6px", borderRadius: 10,
                            borderTopLeftRadius: incoming ? 3 : 10,
                            borderTopRightRadius: incoming ? 10 : 3,
                            background: incoming ? "var(--wa-bg-bubble-in)" : "var(--wa-bg-bubble-out)",
                            border: incoming ? "1px solid var(--wa-border)" : "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                            color: "var(--wa-text-primary)",
                            fontSize: 13.5, lineHeight: 1.45,
                          }}>
                            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", display: "block", fontStyle: isMedia ? "italic" : "normal", color: isMedia ? "var(--wa-text-secondary)" : undefined }}>
                              {isMedia ? mediaPreview(m.type, m.text) : m.text}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 3 }}>
                              <span style={{ fontSize: 10.5, color: "var(--wa-text-meta)" }}>{msgTime(m.timestamp)}</span>
                              {!incoming && (
                                m.readAt
                                  ? <CheckCheck size={13} style={{ color: "var(--accent)" }} />
                                  : m.deliveredAt
                                    ? <CheckCheck size={13} style={{ color: "var(--wa-text-meta)" }} />
                                    : <Check size={13} style={{ color: "var(--wa-text-meta)" }} />
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom bar */}
              <div style={{ flexShrink: 0, borderTop: "1px solid var(--wa-border)", padding: "10px 20px", fontSize: 12, color: "var(--wa-text-meta)", textAlign: "center", background: "var(--wa-bg-header)", letterSpacing: "0.01em" }}>
                🔒 Somente leitura · as respostas são feitas pelo WhatsApp no celular
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: intelligence panel ──────────────────────────────────── */}
        {selected && rightOpen && (
          <div style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--wa-border)", background: "var(--wa-right)", display: "flex", flexDirection: "column", overflowY: "auto" }}>

            {/* Contact */}
            <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid var(--wa-border)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Avatar name={detail?.contact.name ?? null} wa={detail?.contact.waId ?? ""} size={64} />
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--wa-text-primary)", margin: 0 }}>
                  {detail?.contact.name ?? `+${detail?.contact.waId ?? ""}`}
                </p>
                <p style={{ fontSize: 12, color: "var(--wa-text-meta)", margin: "3px 0 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Phone size={10} /> +{detail?.contact.waId}
                </p>
              </div>
            </div>

            {/* Lead info */}
            {detail?.lead && (
              <PanelSection icon={<Megaphone size={13} />} title="Lead de Anúncio">
                {detail.lead.adTitle && <InfoRow label="Anúncio" value={detail.lead.adTitle} />}
                {detail.lead.sourceType && <InfoRow label="Origem" value={detail.lead.sourceType} />}
                {detail.lead.enteredAt && (
                  <InfoRow label="Entrada" value={new Date(detail.lead.enteredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })} />
                )}
              </PanelSection>
            )}

            {/* Funil */}
            <PanelSection icon={<Tag size={13} />} title="Funil de atendimento">
              <select value={detail?.funnelStage ?? ""} onChange={(e) => changeStage(e.target.value)}
                style={{ width: "100%", height: 34, borderRadius: 8, border: "1px solid var(--wa-border)", background: "var(--wa-bg-search)", color: "var(--wa-text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer" }}>
                <option value="">Sem etapa</option>
                {STAGES.map((s) => <option key={s} value={s}>{FUNNEL_LABELS[s]}</option>)}
              </select>
            </PanelSection>

            {/* AI Summary */}
            <PanelSection icon={<Sparkles size={13} />} title="Inteligência IA">
              {!ai ? (
                <button className="wa-summarize-btn" onClick={summarize} disabled={summarizing}
                  style={{ width: "100%", height: 36, borderRadius: 8, border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: summarizing ? "default" : "pointer" }}>
                  {summarizing ? <><Loader2 size={13} className="wa-spin" /> Analisando...</> : <><Sparkles size={13} /> Gerar Resumo</>}
                </button>
              ) : (
                <div>
                  <p style={{ fontSize: 12.5, color: "var(--wa-text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "0 0 10px" }}>{ai.summary}</p>
                  {ai.suggestedStage && ai.suggestedStage !== detail?.funnelStage && (
                    <div style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
                        Sugerido: <strong style={{ color: "var(--wa-text-primary)" }}>{FUNNEL_LABELS[ai.suggestedStage] ?? ai.suggestedStage}</strong>
                      </span>
                      <button onClick={() => changeStage(ai.suggestedStage!)}
                        style={{ height: 26, padding: "0 10px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                        Aplicar
                      </button>
                    </div>
                  )}
                  <button className="wa-summarize-btn" onClick={summarize} disabled={summarizing}
                    style={{ marginTop: 8, fontSize: 11.5, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Sparkles size={11} /> Atualizar resumo
                  </button>
                </div>
              )}
            </PanelSection>

          </div>
        )}

      </div>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--wa-text-meta)", background: "var(--wa-bg-chat)", backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--border) 60%, transparent) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--wa-bg-left)", border: "1px solid var(--wa-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MessageSquare size={32} style={{ opacity: 0.25 }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: "var(--wa-text-secondary)", margin: "0 0 6px" }}>Selecione uma conversa</p>
        <p style={{ fontSize: 13, margin: 0, opacity: 0.6 }}>Escolha na lista à esquerda para visualizar</p>
      </div>
    </div>
  );
}

function PanelSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--wa-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ color: "var(--wa-text-meta)" }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--wa-text-meta)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "var(--wa-text-meta)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: "var(--wa-text-primary)", textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}
