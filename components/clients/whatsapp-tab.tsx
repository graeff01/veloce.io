"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, AlertTriangle, CheckCircle2, MessageSquare, Megaphone, Phone, Users, ExternalLink, Settings2, BarChart3,
} from "lucide-react";
import { WaConversation, type WaConversationContact } from "@/components/clients/wa-conversation";
import { OperationDashboard } from "@/components/whatsapp/operation-dashboard";
import { ConversationsView } from "@/components/whatsapp/conversations-view";

interface Connection {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string | null;
  name: string | null;
  lastEventAt: string | null;
  _count?: { contacts: number; leads: number; messages: number };
}
interface AuditLead { id: string; contactId: string; name: string | null; phone: string | null; enteredAt: string }
interface AuditGroup { adTitle: string; total: number; leads: AuditLead[] }
interface AuditData { totalLeads: number; groups: AuditGroup[] }

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}

export function WhatsAppTab({ clientId }: { clientId: string }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"painel" | "conversas" | "leads">("painel");
  const [data, setData] = useState<AuditData | null>(null);
  const [open, setOpen] = useState<WaConversationContact | null>(null);
  const [editing, setEditing] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const loadConn = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/clients/${clientId}/whatsapp`);
    if (r.ok) setConn(await r.json());
    setLoading(false);
  }, [clientId]);

  const loadLeads = useCallback(async () => {
    const r = await fetch(`/api/audit?clientId=${clientId}&year=${year}&month=${month}`);
    if (r.ok) setData(await r.json());
  }, [clientId, year, month]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadConn(); }, [loadConn]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (conn) loadLeads(); }, [conn, loadLeads]);

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );

  if (!conn || editing) return (
    <Setup
      clientId={clientId}
      initial={conn ? {
        wabaId: conn.wabaId,
        phoneNumberId: conn.phoneNumberId,
        accessToken: "",
        appSecret: "",
        displayPhone: conn.displayPhone ?? "",
      } : undefined}
      onSaved={() => { setEditing(false); void loadConn(); }}
      onCancel={conn ? () => setEditing(false) : undefined}
    />
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ padding: "18px 28px 0", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(37,211,102,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MessageSquare size={16} color="#25D366" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{conn.name ?? "WhatsApp"} {conn.displayPhone && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {conn.displayPhone}</span>}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                {conn._count?.contacts ?? 0} contatos · {conn._count?.leads ?? 0} leads de anúncio
                {conn.lastEventAt ? ` · última atividade ${timeAgo(conn.lastEventAt)}` : " · aguardando 1ª mensagem"}
              </p>
            </div>
          </div>
          <button onClick={() => setEditing(true)} title="Atualizar conexão" style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <Settings2 size={13} /> Atualizar conexão
          </button>
        </div>
        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {([["painel", "Painel"], ["leads", "Leads de anúncio"], ["conversas", "Conversas"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
              fontWeight: view === k ? 600 : 500, color: view === k ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: view === k ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {view === "conversas" ? (
        <div style={{ flex: 1, minHeight: 0, padding: "16px 28px" }}>
          <ConversationsView clientId={clientId} />
        </div>
      ) : (
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={select}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={select}>
              {[0, 1, 2].map((d) => { const y = now.getFullYear() - d; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </div>
          {view === "leads" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <Users size={15} color="var(--accent)" />
              <strong style={{ color: "var(--text-primary)" }}>{data?.totalLeads ?? 0}</strong> leads no mês
            </div>
          )}
        </div>

        {view === "painel" && (
          <OperationDashboard
            clientId={clientId}
            year={year}
            month={month}
            onOpenContact={(c) => setOpen({ contactId: c.contactId, name: c.name, phone: c.phone, adTitle: null })}
          />
        )}

        {view === "leads" && (
          <>
            {!data || data.groups.length === 0 ? (
              <Empty text="Nenhum lead de anúncio nesse período. Eles aparecem aqui automaticamente quando entram pelo anúncio." />
            ) : data.groups.map((g) => (
              <div key={g.adTitle} style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--bg-elevated)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Megaphone size={14} color="var(--accent)" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{g.adTitle}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "rgba(124,58,237,0.1)", padding: "2px 10px", borderRadius: 20 }}>{g.total} lead{g.total !== 1 ? "s" : ""}</span>
                </div>
                {g.leads.map((l, i) => (
                  <Row key={l.id} onClick={() => setOpen({ contactId: l.contactId, name: l.name, phone: l.phone, adTitle: g.adTitle })} last={i === g.leads.length - 1}>
                    <span style={cellName}>{l.name ?? "—"}</span>
                    <span style={cellPhone}>{l.phone ? <><Phone size={11} /> +{l.phone}</> : "—"}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(l.enteredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                  </Row>
                ))}
              </div>
            ))}
          </>
        )}

      </div>
      )}

      {open && <WaConversation clientId={clientId} contact={open} onClose={() => setOpen(null)} onFunnelChange={() => { void loadConn(); }} />}
    </div>
  );
}

function Row({ children, onClick, last }: { children: React.ReactNode; onClick: () => void; last: boolean }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 16px", borderBottom: last ? "none" : "1px solid var(--border)", cursor: "pointer" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px" }}>
      <MessageSquare size={30} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px", display: "block" }} />
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.5, maxWidth: 420, margin: "0 auto" }}>{text}</p>
    </div>
  );
}

// ── Setup ────────────────────────────────────────────────────────────────────
function Setup({ clientId, initial, onSaved, onCancel }: {
  clientId: string;
  initial?: { wabaId: string; phoneNumberId: string; accessToken: string; appSecret: string; displayPhone: string };
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(initial ?? { wabaId: "", phoneNumberId: "", accessToken: "", appSecret: "", displayPhone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.wabaId || !f.phoneNumberId || !f.accessToken) return;
    setSaving(true); setError("");
    const r = await fetch(`/api/clients/${clientId}/whatsapp`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    });
    if (!r.ok) { const d = await r.json(); setError(d.error ?? "Erro ao salvar"); setSaving(false); return; }
    onSaved();
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", padding: "32px 28px" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(37,211,102,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <MessageSquare size={26} color="#25D366" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>{initial ? "Atualizar WhatsApp" : "Conectar WhatsApp (Cloud API)"}</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Cole os dados do app da Meta. As mensagens passam a chegar aqui em tempo real, com o anúncio de origem identificado automaticamente.
          </p>
          <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8 }}>
            Abrir Meta for Developers <ExternalLink size={10} />
          </a>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="WABA ID (conta WhatsApp Business)"><input value={f.wabaId} onChange={set("wabaId")} placeholder="118714174662593" required style={inp} /></Field>
          <Field label="Phone Number ID"><input value={f.phoneNumberId} onChange={set("phoneNumberId")} placeholder="ID do número (na config da API)" required style={inp} /></Field>
          <Field label="Número exibido (opcional)"><input value={f.displayPhone} onChange={set("displayPhone")} placeholder="+55 54 ..." style={inp} /></Field>
          <Field label="Access Token (System User)"><textarea value={f.accessToken} onChange={set("accessToken")} placeholder="EAAG..." required rows={3} style={{ ...inp, height: "auto", padding: "10px 12px", resize: "none", fontFamily: "monospace", fontSize: 11 }} /></Field>
          <Field label="App Secret (opcional, valida a assinatura)"><input value={f.appSecret} onChange={set("appSecret")} placeholder="••••••" style={inp} /></Field>

          {error && <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", fontSize: 12, color: "#DC2626", display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={13} /> {error}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            {onCancel && (
              <button type="button" onClick={onCancel} style={{ flex: 1, padding: "10px 20px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancelar
              </button>
            )}
            <button type="submit" disabled={saving} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 20px", borderRadius: 9, border: "none", background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />} {initial ? "Salvar conexão" : "Conectar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" };
const cellName: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 };
const cellPhone: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5, width: 160 };
const inp: React.CSSProperties = { height: 40, width: "100%", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" };
const select: React.CSSProperties = { height: 34, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer" };
