"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Zap, X, Loader2, Check, ExternalLink, AlignLeft,
  RotateCcw, Filter, Lightbulb, ChevronDown, ChevronUp,
  ArrowRight, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Movement {
  id: string;
  clientId: string;
  title: string;
  category: string;
  status: "PLANNED" | "IN_PROGRESS" | "REVIEW" | "DONE" | "ARCHIVED";
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  date: string;
  description?: string | null;
  links: string[];
  tags: string[];
  assignee?: { id: string; name: string } | null;
}

interface BrainItem {
  id: string;
  title: string;
  content?: string | null;
  category: string;
  links: string[];
  tags: string[];
  pinned: boolean;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Campanha","Conteúdo","Reunião","Estratégia","Entrega",
  "Análise","Gravação","Criativo","Aprovação","Ajuste","Captação","Outro",
];

const BRAIN_CATEGORIES = ["Estratégia","Campanha","Concorrência","Referência","Insight","Oportunidade"];

const STATUS_CFG: Record<Movement["status"], { label: string; color: string; bg: string; next: Movement["status"] }> = {
  PLANNED:     { label: "Planejado",    color: "var(--text-muted)", bg: "var(--bg-elevated)", next: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Em andamento", color: "#D97706",           bg: "#FEF3C7",             next: "REVIEW" },
  REVIEW:      { label: "Em revisão",   color: "#7C3AED",           bg: "#EDE9FE",             next: "DONE" },
  DONE:        { label: "Concluído",    color: "#16A34A",           bg: "#DCFCE7",             next: "PLANNED" },
  ARCHIVED:    { label: "Arquivado",    color: "var(--text-muted)", bg: "var(--bg-surface)",   next: "PLANNED" },
};

const PRIORITY_COLOR: Record<Movement["priority"], string> = {
  CRITICAL: "#DC2626", HIGH: "#D97706", NORMAL: "transparent", LOW: "transparent",
};

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function isOverdue(mv: Movement) {
  return mv.status !== "DONE" && mv.status !== "ARCHIVED" && new Date(mv.date) < new Date();
}

// ── Quick-add bar ──────────────────────────────────────────────────────────────

function QuickAdd({ clientId, onAdded }: { clientId: string; onAdded: (m: Movement) => void }) {
  const [open,     setOpen]     = useState(false);
  const [title,    setTitle]    = useState("");
  const [category, setCategory] = useState("Conteúdo");
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [saving,   setSaving]   = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, title: title.trim(), category, date, status: "PLANNED", priority: "NORMAL", links: [], tags: [] }),
    });
    setSaving(false);
    if (res.ok) { const m = await res.json(); onAdded(m); setTitle(""); setOpen(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "10px 14px", borderRadius: 10,
          border: "1px dashed var(--border)", background: "transparent",
          color: "var(--text-muted)", fontSize: 13, cursor: "pointer",
          transition: "border-color 150ms, color 150ms",
        }}
      >
        <Plus size={14} /> Registrar movimentação…
      </button>
    );
  }

  return (
    <div style={{ borderRadius: 10, border: "1px solid var(--accent)", background: "var(--accent-soft)", overflow: "hidden" }}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="O que está acontecendo?"
        style={{
          width: "100%", padding: "12px 14px", border: "none", background: "transparent",
          fontSize: 14, fontWeight: 600, color: "var(--text-primary)", outline: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderTop: "1px solid var(--accent)22" }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-base)", fontSize: 12, color: "var(--text-secondary)", outline: "none" }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-base)", fontSize: 12, color: "var(--text-secondary)", outline: "none" }} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={14} /></button>
        <button
          onClick={submit}
          disabled={!title.trim() || saving}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: title.trim() ? "pointer" : "default" }}
        >
          {saving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={12} />}
          Registrar
        </button>
      </div>
    </div>
  );
}

// ── Movement card ──────────────────────────────────────────────────────────────

function MvCard({
  mv, onStatusChange, onDelete,
}: {
  mv: Movement;
  onStatusChange: (id: string, s: Movement["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const cfg     = STATUS_CFG[mv.status];
  const overdue = isOverdue(mv);
  const isDone  = mv.status === "DONE";

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${overdue && !isDone ? "#FECACA" : "var(--border)"}`,
      background: isDone ? "var(--bg-base)" : overdue ? "#FFF5F5" : "var(--bg-surface)",
      opacity: isDone ? 0.65 : 1,
      transition: "opacity 150ms",
    }}>
      {/* Priority dot */}
      <div style={{ marginTop: 3, flexShrink: 0 }}>
        {mv.priority !== "NORMAL" && mv.priority !== "LOW" ? (
          <span style={{ display: "block", width: 7, height: 7, borderRadius: "50%", background: PRIORITY_COLOR[mv.priority] }} />
        ) : (
          <span style={{ display: "block", width: 7, height: 7 }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
            textDecoration: isDone ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {mv.title}
          </span>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "var(--bg-elevated)", color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
            {mv.category}
          </span>
        </div>
        {mv.description && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{mv.description}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: overdue && !isDone ? "#DC2626" : "var(--text-muted)", fontWeight: overdue && !isDone ? 600 : 400 }}>
            {overdue && !isDone ? "⚠ " : ""}{fmtDate(mv.date)}
          </span>
          {mv.links.length > 0 && <ExternalLink size={10} style={{ color: "var(--text-muted)" }} />}
        </div>
      </div>

      {/* Status cycle */}
      <button
        onClick={() => onStatusChange(mv.id, cfg.next)}
        title={`Avançar para ${STATUS_CFG[cfg.next].label}`}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: 20, border: "none",
          background: cfg.bg, color: cfg.color,
          fontSize: 10, fontWeight: 700, cursor: "pointer",
          whiteSpace: "nowrap", flexShrink: 0,
          transition: "filter 150ms",
        }}
      >
        {isDone && <Check size={9} />}
        {cfg.label}
        {!isDone && <ArrowRight size={9} />}
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(mv.id)}
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex", opacity: 0.4, flexShrink: 0, marginTop: 2 }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Brain quick-add ────────────────────────────────────────────────────────────

function BrainAdd({ clientId, onAdded }: { clientId: string; onAdded: (b: BrainItem) => void }) {
  const [open,     setOpen]     = useState(false);
  const [title,    setTitle]    = useState("");
  const [content,  setContent]  = useState("");
  const [category, setCategory] = useState("Insight");
  const [saving,   setSaving]   = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, title: title.trim(), content: content || null, category, links: [], tags: [] }),
    });
    setSaving(false);
    if (res.ok) { const b = await res.json(); onAdded(b); setTitle(""); setContent(""); setOpen(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "8px 12px", borderRadius: 8,
          border: "1px dashed var(--border)", background: "transparent",
          color: "var(--text-muted)", fontSize: 12, cursor: "pointer",
        }}
      >
        <Plus size={12} /> Capturar ideia…
      </button>
    );
  }

  return (
    <div style={{ borderRadius: 10, border: "1px solid #A855F7", background: "#FDF4FF", overflow: "hidden" }}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
        placeholder="Qual é a ideia?"
        style={{ width: "100%", padding: "10px 12px", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", outline: "none" }}
      />
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Detalhes, contexto, referências..."
        rows={2}
        style={{ width: "100%", padding: "6px 12px", border: "none", background: "transparent", fontSize: 12, color: "var(--text-secondary)", outline: "none", resize: "none", lineHeight: 1.5 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid #A855F722" }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: "3px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-base)", fontSize: 11, outline: "none" }}>
          {BRAIN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={12} /></button>
        <button
          onClick={submit}
          disabled={!title.trim() || saving}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 7, border: "none", background: "#A855F7", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          {saving ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Lightbulb size={11} />}
          Salvar
        </button>
      </div>
    </div>
  );
}

// ── Brain card ─────────────────────────────────────────────────────────────────

function BrainCard({ item, onDelete }: { item: BrainItem; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const CATEGORY_COLOR: Record<string, string> = {
    Estratégia: "#4338CA", Campanha: "#B45309", Concorrência: "#DC2626",
    Referência: "#0F766E", Insight: "#7C3AED", Oportunidade: "#15803D",
  };
  const color = CATEGORY_COLOR[item.category] ?? "#6366F1";

  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{item.title}</span>
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: `${color}18`, color, fontWeight: 600 }}>{item.category}</span>
            {item.content && (
              <button onClick={() => setExpanded(v => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
            <button onClick={() => onDelete(item.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex", opacity: 0.4 }}><X size={11} /></button>
          </div>
          {expanded && item.content && (
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>{item.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export function MovimentoTab({ clientId }: { clientId: string }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [brains,    setBrains]    = useState<BrainItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<"all" | Movement["status"]>("all");
  const [activeSection, setActiveSection] = useState<"movements" | "brain">("movements");

  const load = useCallback(async () => {
    setLoading(true);
    const [mvRes, brainRes] = await Promise.all([
      fetch(`/api/movements?clientId=${clientId}`),
      fetch(`/api/brain?clientId=${clientId}`),
    ]);
    if (mvRes.ok)    setMovements(await mvRes.json());
    if (brainRes.ok) setBrains(await brainRes.json());
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: string, status: Movement["status"]) {
    setMovements(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    await fetch(`/api/movements/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  }

  async function handleDelete(id: string) {
    setMovements(prev => prev.filter(m => m.id !== id));
    await fetch(`/api/movements/${id}`, { method: "DELETE" });
  }

  async function handleBrainDelete(id: string) {
    setBrains(prev => prev.filter(b => b.id !== id));
    await fetch(`/api/brain/${id}`, { method: "DELETE" });
  }

  const filtered = filter === "all" ? movements : movements.filter(m => m.status === filter);

  // Metrics
  const done      = movements.filter(m => m.status === "DONE").length;
  const inProg    = movements.filter(m => m.status === "IN_PROGRESS").length;
  const overdue   = movements.filter(m => isOverdue(m)).length;
  const planned   = movements.filter(m => m.status === "PLANNED").length;
  const total     = movements.filter(m => m.status !== "ARCHIVED").length;
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0;
  const progColor = pct >= 80 ? "#16A34A" : pct >= 40 ? "#D97706" : overdue > 0 ? "#DC2626" : "var(--accent)";

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

      {/* ── Left: main content ── */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Section tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {(["movements", "brain"] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "1px solid",
                borderColor: activeSection === s ? "var(--accent)" : "var(--border)",
                background: activeSection === s ? "var(--accent-soft)" : "transparent",
                color: activeSection === s ? "var(--accent)" : "var(--text-muted)",
                fontSize: 12, fontWeight: activeSection === s ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {s === "movements" ? `Movimentações ${movements.length > 0 ? `(${movements.length})` : ""}` : `Brain ${brains.length > 0 ? `(${brains.length})` : ""}`}
            </button>
          ))}
        </div>

        {activeSection === "movements" && (
          <>
            {/* Filter chips */}
            {movements.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {(["all", "PLANNED", "IN_PROGRESS", "REVIEW", "DONE"] as const).map(f => {
                  const label = f === "all" ? "Tudo" : STATUS_CFG[f as Movement["status"]].label;
                  const count = f === "all" ? movements.length : movements.filter(m => m.status === f).length;
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      style={{
                        padding: "4px 10px", borderRadius: 20, border: "1px solid",
                        borderColor: filter === f ? "var(--accent)" : "var(--border)",
                        background: filter === f ? "var(--accent-soft)" : "transparent",
                        color: filter === f ? "var(--accent)" : "var(--text-muted)",
                        fontSize: 11, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      {label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <QuickAdd clientId={clientId} onAdded={m => setMovements(prev => [m, ...prev])} />

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                <Zap size={32} style={{ opacity: 0.2, margin: "0 auto 10px" }} />
                <p style={{ fontSize: 13 }}>{filter !== "all" ? "Nenhuma movimentação neste status." : "Nenhuma movimentação registrada ainda."}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered
                  .sort((a, b) => {
                    if (a.status === "DONE" && b.status !== "DONE") return 1;
                    if (a.status !== "DONE" && b.status === "DONE") return -1;
                    return new Date(a.date).getTime() - new Date(b.date).getTime();
                  })
                  .map(mv => (
                    <MvCard key={mv.id} mv={mv} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                  ))}
              </div>
            )}
          </>
        )}

        {activeSection === "brain" && (
          <>
            <BrainAdd clientId={clientId} onAdded={b => setBrains(prev => [b, ...prev])} />
            {brains.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                <Lightbulb size={32} style={{ opacity: 0.2, margin: "0 auto 10px" }} />
                <p style={{ fontSize: 13 }}>Nenhuma ideia capturada ainda.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {brains.map(b => <BrainCard key={b.id} item={b} onDelete={handleBrainDelete} />)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Right: metrics sidebar ── */}
      <aside style={{
        width: 236, flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        overflowY: "auto",
        padding: "20px 16px",
        display: "flex", flexDirection: "column", gap: 20,
      }}>

        {/* Progress */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 12 }}>Visão geral</p>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 38, fontWeight: 800, color: progColor, lineHeight: 1 }}>{done}</span>
            <span style={{ fontSize: 16, color: "var(--text-muted)", marginLeft: 2 }}>/ {total}</span>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{pct}% concluído</p>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: progColor, borderRadius: 3, transition: "width 500ms" }} />
          </div>
        </div>

        {/* Status breakdown */}
        {total > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 }}>Por status</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {([["IN_PROGRESS", inProg, "#D97706"], ["PLANNED", planned, "var(--accent)"], ["DONE", done, "#16A34A"]] as [string, number, string][])
                .filter(([, n]) => n > 0)
                .map(([s, n, c]) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>{STATUS_CFG[s as Movement["status"]].label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{n}</span>
                  </div>
                ))}
              {overdue > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 7, background: "#FFF5F5" }}>
                  <Clock size={11} color="#DC2626" />
                  <span style={{ fontSize: 11, color: "#DC2626", flex: 1, fontWeight: 600 }}>Em atraso</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{overdue}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Brain quick stats */}
        {brains.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 }}>Brain</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "#FDF4FF", border: "1px solid #E9D5FF" }}>
              <Lightbulb size={14} color="#A855F7" />
              <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 600 }}>{brains.length} ideia{brains.length !== 1 ? "s" : ""} capturada{brains.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        )}

        {/* Ações */}
        <div style={{ marginTop: "auto" }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 8 }}>Ações</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}>
              <RotateCcw size={11} /> Atualizar
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
