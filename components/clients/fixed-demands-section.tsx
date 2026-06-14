"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Loader2, Check, X, RefreshCw } from "lucide-react";

interface FixedDemand {
  id: string;
  title: string;
  type: string | null;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  description: string | null;
  active: boolean;
}

const TYPES = ["Post Feed", "Story", "Reels", "Campanha", "Criativo", "Relatório", "Copy", "Outro"];
const PRIORITIES: { value: FixedDemand["priority"]; label: string; color: string }[] = [
  { value: "CRITICAL", label: "Crítica", color: "var(--red)" },
  { value: "HIGH", label: "Alta", color: "var(--amber)" },
  { value: "NORMAL", label: "Normal", color: "var(--text-muted)" },
  { value: "LOW", label: "Baixa", color: "var(--text-muted)" },
];

const surface: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-card)" };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", boxSizing: "border-box" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" };

export function FixedDemandsSection({ clientId, isAdmin }: { clientId: string; isAdmin: boolean }) {
  const [demands, setDemands] = useState<FixedDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState<FixedDemand["priority"]>("NORMAL");
  const [description, setDescription] = useState("");

  function load() {
    fetch(`/api/clients/${clientId}/fixed-demands`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setDemands(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  function resetForm() {
    setEditingId(null); setTitle(""); setType(""); setPriority("NORMAL"); setDescription("");
  }

  function startEdit(d: FixedDemand) {
    setEditingId(d.id); setTitle(d.title); setType(d.type ?? ""); setPriority(d.priority); setDescription(d.description ?? "");
  }

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    const body = JSON.stringify({ title: title.trim(), type: type || null, priority, description: description.trim() || null });
    if (editingId) {
      await fetch(`/api/clients/${clientId}/fixed-demands/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    } else {
      await fetch(`/api/clients/${clientId}/fixed-demands`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    }
    setSaving(false); resetForm(); load();
  }

  async function toggleActive(d: FixedDemand) {
    setDemands((xs) => xs.map((x) => (x.id === d.id ? { ...x, active: !x.active } : x)));
    await fetch(`/api/clients/${clientId}/fixed-demands/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !d.active }) });
  }

  async function remove(d: FixedDemand) {
    setDemands((xs) => xs.filter((x) => x.id !== d.id));
    if (editingId === d.id) resetForm();
    await fetch(`/api/clients/${clientId}/fixed-demands/${d.id}`, { method: "DELETE" });
  }

  return (
    <div style={surface}>
      <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", borderRadius: "12px 12px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <RefreshCw size={13} style={{ color: "var(--accent)" }} />
          <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>Demandas fixas</p>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "5px 0 0", lineHeight: 1.5 }}>
          Entram automaticamente em <b>A fazer</b> todo início de mês, com prazo <b>até o fim do mês</b>. Cadastre uma vez — repete todo mês.
        </p>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center" }}><Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>
        ) : demands.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "6px 2px" }}>Nenhuma demanda fixa ainda.</p>
        ) : (
          demands.map((d) => {
            const pri = PRIORITIES.find((p) => p.value === d.priority)!;
            return (
              <div key={d.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 10, background: d.active ? "var(--bg-base)" : "transparent", opacity: d.active ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{d.title}</div>
                  {d.description && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.45 }}>{d.description}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                    {d.type && <span style={{ fontSize: 10.5, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "1px 7px", borderRadius: 999 }}>{d.type}</span>}
                    {d.priority !== "NORMAL" && <span style={{ fontSize: 10.5, fontWeight: 650, color: pri.color }}>{pri.label}</span>}
                    {!d.active && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>pausada</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button title={d.active ? "Pausar" : "Reativar"} onClick={() => toggleActive(d)} style={{ width: 30, height: 18, borderRadius: 999, border: "none", cursor: "pointer", background: d.active ? "var(--green)" : "var(--border)", position: "relative", flexShrink: 0 }}>
                      <span style={{ position: "absolute", top: 2, left: d.active ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                    </button>
                    <button title="Editar" onClick={() => startEdit(d)} style={{ ...ghostBtn, padding: 6 }}><Pencil size={12} /></button>
                    <button title="Remover" onClick={() => remove(d)} style={{ ...ghostBtn, padding: 6, color: "var(--red)" }}><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Form add/editar */}
        {isAdmin && (
          <div style={{ marginTop: 4, padding: 12, border: "1px dashed var(--border-strong)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Relatório mensal de performance" style={field}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...field, flex: 1 }}>
                <option value="">Tipo (opcional)</option>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={priority} onChange={(e) => setPriority(e.target.value as FixedDemand["priority"])} style={{ ...field, flex: 1 }}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={2}
              style={{ ...field, height: "auto", padding: "8px 10px", resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {editingId && (
                <button onClick={resetForm} style={ghostBtn}><X size={13} /> Cancelar</button>
              )}
              <button onClick={submit} disabled={saving || !title.trim()}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: saving || !title.trim() ? "default" : "pointer", opacity: saving || !title.trim() ? 0.6 : 1 }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : editingId ? <Check size={13} /> : <Plus size={13} />}
                {editingId ? "Salvar alteração" : "Adicionar demanda fixa"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
