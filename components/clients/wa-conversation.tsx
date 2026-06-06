"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Phone, MessageSquare, Megaphone } from "lucide-react";

export interface WaConversationContact {
  contactId: string;
  name: string | null;
  phone: string | null;
  adTitle?: string | null;
}

interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string }

// Drawer com o histórico de mensagens do WhatsApp (somente leitura).
export function WaConversation({ clientId, contact, onClose }: {
  clientId: string;
  contact: WaConversationContact;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Msg[] | null>(null);
  const [adTitle, setAdTitle] = useState<string | null>(contact.adTitle ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/clients/${clientId}/whatsapp/conversations/${contact.contactId}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok) setError(d.error ?? "Erro ao carregar conversa");
        else { setItems(d.items); if (d.lead?.adTitle) setAdTitle(d.lead.adTitle); }
      })
      .catch(() => active && setError("Erro ao carregar conversa"));
    return () => { active = false; };
  }, [clientId, contact.contactId]);

  const title = contact.name ?? contact.phone ?? "Conversa";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "100%", height: "100%", background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-8px 0 34px rgba(0,0,0,0.18)" }}>
        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              {contact.phone && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Phone size={11} /> +{contact.phone}
                </span>
              )}
            </div>
            {adTitle && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 10, color: "var(--accent)", background: "rgba(124,58,237,0.1)", padding: "2px 8px", borderRadius: 20 }}>
                <Megaphone size={10} /> {adTitle}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, background: "var(--bg-base)" }}>
          {error && <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>}
          {!items && !error && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
            </div>
          )}
          {items && items.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "0 20px" }}>
              <MessageSquare size={28} style={{ color: "var(--text-muted)", opacity: 0.3 }} />
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>Sem mensagens registradas ainda nesta conversa.</p>
            </div>
          )}
          {items?.map((m) => {
            const incoming = m.direction !== "out";
            return (
              <div key={m.id} style={{ alignSelf: incoming ? "flex-start" : "flex-end", maxWidth: "82%" }}>
                <div style={{
                  padding: "8px 11px", borderRadius: 12,
                  background: incoming ? "var(--bg-surface)" : "var(--accent)",
                  color: incoming ? "var(--text-primary)" : "#fff",
                  border: incoming ? "1px solid var(--border)" : "none",
                  fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {m.text ?? `[${m.type}]`}
                </div>
                <p style={{ fontSize: 9.5, color: "var(--text-muted)", margin: "3px 4px 0", textAlign: incoming ? "left" : "right" }}>
                  {new Date(m.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
