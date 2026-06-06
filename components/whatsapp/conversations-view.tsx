"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, Phone, Megaphone, Check, CheckCheck, MessageSquare } from "lucide-react";
import { timeAgo, FUNNEL_LABELS } from "@/lib/wa-format";

interface ConvRow {
  contactId: string; waId: string; name: string | null;
  lastMessageAt: string | null; lastText: string | null; lastDirection: string | null;
  fromAd: boolean; adTitle: string | null;
}
interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string; deliveredAt: string | null; readAt: string | null }
interface Detail { contact: { id: string; waId: string; name: string | null }; lead: { adTitle: string | null } | null; funnelStage: string | null; items: Msg[] }

const STAGES = ["recebido", "respondido", "qualificado", "negociacao", "perdido", "convertido"];

// Cor estável por contato (avatar)
function avatarColor(seed: string) {
  const colors = ["#7C3AED", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#8B5CF6"];
  let h = 0;
  for (const ch of seed) h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
}
function initials(name: string | null, wa: string) {
  const s = (name ?? wa).trim();
  return s.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function dayLabel(iso: string) {
  const d = new Date(iso); const today = new Date();
  const isSame = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (isSame(d, today)) return "Hoje";
  if (isSame(d, yest)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// Conversas estilo WhatsApp (2 painéis), SOMENTE LEITURA.
export function ConversationsView({ clientId, onFunnelChange }: { clientId: string; onFunnelChange?: () => void }) {
  const [list, setList] = useState<ConvRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/whatsapp/conversations`);
    if (r.ok) setList(await r.json());
    setLoadingList(false);
  }, [clientId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingDetail(true);
    setDetail(null);
    fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setDetail(d); setLoadingDetail(false); } })
      .catch(() => active && setLoadingDetail(false));
    return () => { active = false; };
  }, [clientId, selected]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((c) => (c.name ?? "").toLowerCase().includes(term) || c.waId.includes(term));
  }, [list, q]);

  async function changeStage(value: string) {
    if (!selected) return;
    setDetail((d) => (d ? { ...d, funnelStage: value || null } : d));
    await fetch(`/api/clients/${clientId}/whatsapp/conversations/${selected}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ funnelStage: value || null }),
    });
    onFunnelChange?.();
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 230px)", minHeight: 460, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg-surface)" }}>
      {/* Lista */}
      <div style={{ width: 320, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", padding: "0 10px" }}>
            <Search size={14} color="var(--text-muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa" style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text-primary)", fontSize: 13 }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingList ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: 24 }}>Nenhuma conversa.</p>
          ) : filtered.map((c) => (
            <button key={c.contactId} onClick={() => setSelected(c.contactId)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", cursor: "pointer", textAlign: "left",
              background: selected === c.contactId ? "var(--bg-hover)" : "transparent", borderBottom: "1px solid var(--border)",
            }}>
              <Avatar name={c.name} wa={c.waId} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 5 }}>
                    {c.name ?? `+${c.waId}`} {c.fromAd && <Megaphone size={11} color="var(--accent)" />}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}</span>
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                  {c.lastDirection === "out" ? "✓ " : ""}{c.lastText ?? "—"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg-base)" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-muted)" }}>
            <MessageSquare size={34} style={{ opacity: 0.25 }} />
            <p style={{ fontSize: 13 }}>Selecione uma conversa para visualizar</p>
          </div>
        ) : (
          <>
            {/* Header do chat */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Avatar name={detail?.contact.name ?? null} wa={detail?.contact.waId ?? ""} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail?.contact.name ?? `+${detail?.contact.waId ?? ""}`}</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
                    <Phone size={10} /> +{detail?.contact.waId}
                    {detail?.lead?.adTitle && <span style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 3 }}>· <Megaphone size={10} /> {detail.lead.adTitle}</span>}
                  </p>
                </div>
              </div>
              <select value={detail?.funnelStage ?? ""} onChange={(e) => changeStage(e.target.value)}
                style={{ height: 30, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 10px", fontSize: 12, outline: "none", cursor: "pointer", flexShrink: 0 }}>
                <option value="">Funil: —</option>
                {STAGES.map((s) => <option key={s} value={s}>{FUNNEL_LABELS[s]}</option>)}
              </select>
            </div>

            {/* Mensagens */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
              {loadingDetail || !detail ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>
              ) : detail.items.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", marginTop: 24 }}>Sem mensagens registradas.</p>
              ) : detail.items.map((m, i) => {
                const incoming = m.direction !== "out";
                const prev = detail.items[i - 1];
                const showDay = !prev || dayLabel(prev.timestamp) !== dayLabel(m.timestamp);
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div style={{ textAlign: "center", margin: "10px 0" }}>
                        <span style={{ fontSize: 10.5, color: "var(--text-muted)", background: "var(--bg-elevated)", padding: "3px 10px", borderRadius: 20 }}>{dayLabel(m.timestamp)}</span>
                      </div>
                    )}
                    <div style={{ alignSelf: incoming ? "flex-start" : "flex-end", maxWidth: "76%", marginLeft: incoming ? 0 : "auto" }}>
                      <div style={{
                        padding: "7px 10px 5px", borderRadius: 10,
                        borderTopLeftRadius: incoming ? 2 : 10, borderTopRightRadius: incoming ? 10 : 2,
                        background: incoming ? "var(--bg-surface)" : "var(--accent)",
                        color: incoming ? "var(--text-primary)" : "#fff",
                        border: incoming ? "1px solid var(--border)" : "none",
                        fontSize: 12.5, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {m.text ?? `[${m.type}]`}
                        <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 8, float: "right", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {new Date(m.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          {!incoming && (m.readAt ? <CheckCheck size={11} color="#93C5FD" /> : m.deliveredAt ? <CheckCheck size={11} /> : <Check size={11} />)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid var(--border)", padding: "9px 16px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", background: "var(--bg-surface)" }}>
              Somente leitura · as respostas são feitas pelo WhatsApp no celular
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Avatar({ name, wa }: { name: string | null; wa: string }) {
  return (
    <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarColor(wa || "x"), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
      {initials(name, wa)}
    </div>
  );
}
