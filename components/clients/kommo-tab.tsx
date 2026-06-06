"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, Loader2, X, AlertTriangle, CheckCircle2,
  Users, Megaphone, Phone, ExternalLink, Tag, Check,
} from "lucide-react";
import { LeadConversation, type ConversationLead } from "@/components/clients/lead-conversation";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Connection {
  id: string;
  subdomain: string;
  accountName: string | null;
  adTags: string[];
  lastSyncAt: string | null;
  _count?: { leads: number };
}

interface AuditLead {
  id: string;
  kommoId: number;
  leadId?: number | null;
  name: string | null;
  contactName: string | null;
  phone: string | null;
  tags?: string[] | null;
  statusName: string | null;
  pipelineName: string | null;
  createdAtKommo: string;
}
interface AuditGroup { adTag: string; total: number; leads: AuditLead[] }
interface AuditData {
  client: { id: string; name: string };
  lastSyncAt: string | null;
  totalLeads: number;
  groups: AuditGroup[];
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function KommoTab({ clientId }: { clientId: string }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [openLead, setOpenLead] = useState<ConversationLead | null>(null);
  const [tagPanel, setTagPanel] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{ synced: number; scanned: number; tagsSeen: string[] } | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<AuditData | null>(null);

  const loadConn = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/kommo`);
    if (res.ok) setConn(await res.json());
    setLoading(false);
  }, [clientId]);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/audit?clientId=${clientId}&year=${year}&month=${month}`);
    if (res.ok) setData(await res.json());
  }, [clientId, year, month]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadConn(); }, [loadConn]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (conn) loadData(); }, [conn, loadData]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    setSyncInfo(null);
    const res = await fetch(`/api/clients/${clientId}/kommo/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const body = await res.json();
    if (!res.ok) setError(body.error ?? "Erro ao sincronizar");
    else {
      setSyncInfo({ synced: body.synced ?? 0, scanned: body.scanned ?? 0, tagsSeen: body.tagsSeen ?? [] });
      await loadConn();
      await loadData();
    }
    setSyncing(false);
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar o Kommo? Os leads sincronizados serão removidos.")) return;
    await fetch(`/api/clients/${clientId}/kommo`, { method: "DELETE" });
    setConn(null);
    setData(null);
  }

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );

  if (!conn) return <Setup clientId={clientId} onSaved={loadConn} />;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ padding: "18px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(124,58,237,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Megaphone size={16} color="var(--accent)" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              {conn.accountName ?? conn.subdomain}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
              {conn.subdomain}.kommo.com
              {conn.lastSyncAt && <span> · Sincronizado {timeAgo(conn.lastSyncAt)}</span>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTagPanel(true)} style={btn}>
            <Tag size={12} /> Tags de anúncio
          </button>
          <button onClick={handleSync} disabled={syncing} style={btn}>
            {syncing ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />}
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </button>
          <button onClick={handleDisconnect} style={{ ...btn, color: "var(--text-muted)" }}>
            <X size={12} /> Desconectar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: "16px 28px 0", padding: "10px 14px", borderRadius: 9, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", fontSize: 12, color: "#DC2626", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {syncInfo && (
        <div style={{ margin: "16px 28px 0", padding: "10px 14px", borderRadius: 9, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.18)", fontSize: 12, color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text-primary)" }}>{syncInfo.synced}</strong> leads de anúncio encontrados (de {syncInfo.scanned} verificados).
          {syncInfo.tagsSeen.length > 0 && (
            <span> Anúncios: {syncInfo.tagsSeen.map((t) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--accent)", background: "rgba(124,58,237,0.1)", padding: "1px 7px", borderRadius: 20, margin: "0 2px" }}>{t}</span>
            ))}</span>
          )}
        </div>
      )}

      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Period + total */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={select}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={select}>
              {[0, 1, 2].map((d) => { const y = now.getFullYear() - d; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            <Users size={15} color="var(--accent)" />
            <strong style={{ color: "var(--text-primary)" }}>{data?.totalLeads ?? 0}</strong> leads no mês
          </div>
        </div>

        {!data || data.groups.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Megaphone size={32} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
              Nenhum lead nesse período. Clique em Sincronizar para puxar do Kommo.
            </p>
          </div>
        ) : (
          data.groups.map((g) => <AdGroup key={g.adTag} group={g} onOpen={setOpenLead} />)
        )}
      </div>

      {openLead && (
        <LeadConversation clientId={clientId} lead={openLead} onClose={() => setOpenLead(null)} />
      )}
      {tagPanel && (
        <TagPanel
          clientId={clientId}
          selected={conn.adTags}
          onClose={() => setTagPanel(false)}
          onSaved={async () => { setTagPanel(false); await loadConn(); await handleSync(); }}
        />
      )}
    </div>
  );
}

// ── Ad group (collapsible card) ─────────────────────────────────────────────────
function AdGroup({ group, onOpen }: { group: AuditGroup; onOpen: (l: ConversationLead) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--bg-elevated)", border: "none", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Megaphone size={14} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{group.adTag}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "rgba(124,58,237,0.1)", padding: "2px 10px", borderRadius: 20 }}>
          {group.total} lead{group.total !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1.2fr 90px", padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
            {["Lead", "Telefone", "Status", "Entrada"].map((h) => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          {group.leads.map((l, i) => (
            <div
              key={l.id}
              onClick={() => onOpen(l)}
              title="Ver conversa"
              style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1.2fr 90px", padding: "10px 16px", borderBottom: i < group.leads.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center", cursor: "pointer" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                  {l.contactName ?? l.name ?? "—"}
                </span>
                {l.tags && l.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                    {l.tags.map((t) => (
                      <span key={t} style={{ fontSize: 9.5, color: "var(--text-muted)", background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 20 }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                {l.phone ? <><Phone size={11} /> {l.phone}</> : "—"}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{l.statusName ?? "—"}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {new Date(l.createdAtKommo).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tag panel: descobre as tags reais da conta e marca quais são "anúncio" ──────
function TagPanel({ clientId, selected, onClose, onSaved }: {
  clientId: string;
  selected: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tags, setTags] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/clients/${clientId}/kommo/tags`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok) setError(d.error ?? "Erro ao buscar tags");
        else setTags(d.tags);
      })
      .catch(() => active && setError("Erro ao buscar tags"));
    return () => { active = false; };
  }, [clientId]);

  function toggle(t: string) {
    setPicked((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  }

  async function save() {
    setSaving(true); setError("");
    const res = await fetch(`/api/clients/${clientId}/kommo`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adTags: [...picked] }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Erro ao salvar"); setSaving(false); return; }
    onSaved();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", maxHeight: "80vh", background: "var(--bg-surface)", borderRadius: 14, border: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Tags de anúncio</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>Marque quais tags representam anúncios. Os leads com elas são agrupados por anúncio.</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex" }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
          {error && <p style={{ fontSize: 12, color: "#DC2626", marginBottom: 8 }}>{error}</p>}
          {!tags && !error && (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
            </div>
          )}
          {tags && tags.length === 0 && (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>Nenhuma tag encontrada na conta Kommo.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tags?.map((t) => {
              const on = picked.has(t);
              return (
                <button key={t} onClick={() => toggle(t)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid " + (on ? "var(--accent)" : "var(--border)"), background: on ? "rgba(124,58,237,0.08)" : "transparent", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: "1px solid " + (on ? "var(--accent)" : "var(--border-strong)"), background: on ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {on && <Check size={12} color="#fff" />}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Tag size={11} color="var(--text-muted)" /> {t}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{picked.size} selecionada{picked.size !== 1 ? "s" : ""}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ ...btn, border: "1px solid var(--border)" }}>Cancelar</button>
            <button onClick={save} disabled={saving} style={{ ...btn, background: "var(--accent)", color: "#fff", border: "none" }}>
              {saving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Setup form ──────────────────────────────────────────────────────────────────
function Setup({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [subdomain, setSubdomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adTags, setAdTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subdomain.trim() || !accessToken.trim()) return;
    setSaving(true); setError("");
    const res = await fetch(`/api/clients/${clientId}/kommo`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subdomain: subdomain.trim(),
        accessToken: accessToken.trim(),
        adTags: adTags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Erro ao conectar"); setSaving(false); return; }
    onSaved();
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", padding: "32px 28px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(124,58,237,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Megaphone size={26} color="var(--accent)" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Conectar Kommo CRM</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Puxe os leads do Kommo por anúncio para auditoria e relatórios — sem precisar abrir o Kommo.
          </p>
        </div>

        <div style={{ textAlign: "left", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Como gerar o token</p>
          {[
            "Kommo → Configurações → Integrações → criar integração",
            "Aba \"Token de longa duração\" → gerar",
            "Copiar o token e colar abaixo",
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(124,58,237,0.1)", color: "var(--accent)", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{s}</p>
            </div>
          ))}
          <a href="https://www.kommo.com/developers/content/oauth/step-by-step/" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            Documentação <ExternalLink size={10} />
          </a>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Domínio Kommo">
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="contatograeff1" required style={inp} />
            <Hint>Só o subdomínio ou a URL completa (ex: contatograeff1.kommo.com)</Hint>
          </Field>
          <Field label="Token de longa duração">
            <textarea value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="eyJ..." required rows={3} style={{ ...inp, height: "auto", padding: "10px 12px", resize: "none", fontFamily: "monospace", fontSize: 11, lineHeight: 1.5 }} />
          </Field>
          <Field label="Tags de anúncio (opcional)">
            <input value={adTags} onChange={(e) => setAdTags(e.target.value)} placeholder="Anúncio Taos Highline, Anúncio Feirão BV" style={inp} />
            <Hint>Separadas por vírgula. Se vazio, usamos as tags que contêm &quot;Anúncio&quot;.</Hint>
          </Field>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", fontSize: 12, color: "#DC2626", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}

          <button type="submit" disabled={saving} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 20px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />}
            {saving ? "Verificando..." : "Conectar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Small UI helpers ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{children}</p>;
}

const inp: React.CSSProperties = {
  height: 40, width: "100%", borderRadius: 9, border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 12px",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)",
  fontSize: 12, fontWeight: 500, cursor: "pointer",
};
const select: React.CSSProperties = {
  height: 34, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)",
  color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer",
};
