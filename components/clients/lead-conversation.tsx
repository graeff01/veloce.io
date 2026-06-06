"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Phone, MessageSquare, Tag } from "lucide-react";

export interface ConversationLead {
  kommoId: number;
  name: string | null;
  contactName: string | null;
  phone: string | null;
  tags?: string[] | null;
  statusName?: string | null;
}

interface Msg { id: number; text: string; incoming: boolean | null; createdAt: number; author: string | null }

// Drawer lateral com a conversa/timeline do lead, puxada do Kommo sob demanda.
export function LeadConversation({ clientId, lead, onClose }: {
  clientId: string;
  lead: ConversationLead;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Msg[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/clients/${clientId}/kommo/leads/${lead.kommoId}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok) setError(d.error ?? "Erro ao carregar conversa");
        else setItems(d.items);
      })
      .catch(() => active && setError("Erro ao carregar conversa"));
    return () => { active = false; };
  }, [clientId, lead.kommoId]);

  const title = lead.contactName ?? lead.name ?? "Lead";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: "100%", height: "100%", background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-8px 0 34px rgba(0,0,0,0.18)" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              {lead.phone && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Phone size={11} /> {lead.phone}
                </span>
              )}
              {lead.statusName && (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{lead.statusName}</span>
              )}
            </div>
            {lead.tags && lead.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {lead.tags.map((t) => (
                  <span key={t} style={{ fontSize: 10, color: "var(--accent)", background: "rgba(124,58,237,0.1)", padding: "2px 8px", borderRadius: 20, display: "flex", alignItems: "center", gap: 3 }}>
                    <Tag size={9} /> {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, background: "var(--bg-base)" }}>
          {error && (
            <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>
          )}
          {!items && !error && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
            </div>
          )}
          {items && items.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "0 20px" }}>
              <MessageSquare size={28} style={{ color: "var(--text-muted)", opacity: 0.3 }} />
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                O Kommo não expôs mensagens de texto para este lead via API. As conversas completas do WhatsApp ficam na camada de chat do Kommo, fora do alcance da API pública.
              </p>
            </div>
          )}
          {items?.map((m) => {
            const incoming = m.incoming !== false; // trata null como recebida/evento
            return (
              <div key={m.id} style={{ alignSelf: incoming ? "flex-start" : "flex-end", maxWidth: "82%" }}>
                <div style={{
                  padding: "8px 11px", borderRadius: 12,
                  background: incoming ? "var(--bg-surface)" : "var(--accent)",
                  color: incoming ? "var(--text-primary)" : "#fff",
                  border: incoming ? "1px solid var(--border)" : "none",
                  fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {m.text}
                </div>
                <p style={{ fontSize: 9.5, color: "var(--text-muted)", margin: "3px 4px 0", textAlign: incoming ? "left" : "right" }}>
                  {new Date(m.createdAt * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
