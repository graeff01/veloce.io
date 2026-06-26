"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Lock } from "lucide-react";

export function PortalAccessCard({ clientId }: { clientId: string }) {
  const [emails, setEmails] = useState<{ id: string; email: string }[] | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function load() { fetch(`/api/clients/${clientId}/portal-access`).then((r) => r.json()).then((d) => setEmails(d.emails ?? [])); }
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    const e = val.trim().toLowerCase();
    if (!e || !e.includes("@")) { setErr("E-mail inválido."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/clients/${clientId}/portal-access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e }) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Erro ao adicionar."); return; }
    setVal(""); load();
  }
  async function del(email: string) {
    if (!confirm(`Remover o acesso de ${email}? As sessões dele são derrubadas.`)) return;
    await fetch(`/api/clients/${clientId}/portal-access?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    load();
  }

  const field: React.CSSProperties = { flex: 1, minWidth: 160, height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, boxSizing: "border-box" };
  const on = (emails?.length ?? 0) > 0;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}><Lock size={13} /> Acesso ao painel (login)</h3>
      <div style={{ fontSize: 11.5, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, marginBottom: 12, background: on ? "color-mix(in srgb, var(--green) 10%, transparent)" : "var(--bg-base)", border: `1px solid ${on ? "color-mix(in srgb, var(--green) 30%, transparent)" : "var(--border)"}`, color: "var(--text-secondary)" }}>
        {on
          ? <><b style={{ color: "var(--green)" }}>Login LIGADO.</b> Só os e-mails abaixo entram — recebem um código por e-mail pra acessar.</>
          : <><b>Painel aberto pelo link.</b> Adicione e-mails pra exigir login (código por e-mail) e proteger as métricas + conversas.</>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {emails === null ? <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          : emails.length === 0 ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhum e-mail autorizado.</p>
          : emails.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-base)" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.email}</span>
              <button onClick={() => del(e.email)} title="Revogar" style={{ display: "inline-flex", padding: 5, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--red)", cursor: "pointer" }}><Trash2 size={12} /></button>
            </div>
          ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input style={field} type="email" value={val} onChange={(e) => setVal(e.target.value)} placeholder="email@autorizado.com" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button onClick={add} disabled={busy || !val.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy || !val.trim() ? 0.6 : 1 }}><Plus size={14} /> Autorizar</button>
      </div>
      {err && <p style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{err}</p>}
    </div>
  );
}
