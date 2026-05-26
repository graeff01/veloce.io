"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus, X, Loader2, Check,
  Camera, Users, Package, Rocket, Palette, CheckCircle2,
  Aperture, ClipboardList, TrendingUp, BarChart2, Wrench,
  Zap, FileText, ChevronDown, ChevronUp, RefreshCw,
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
}

// ── Category config ────────────────────────────────────────────────────────────

const DEFAULT_CAT = { color: "#7C3AED", bg: "rgba(124,58,237,0.12)", Icon: Zap };

const CAT_CFG: Record<string, { color: string; bg: string; Icon: React.ElementType }> = {
  "Gravação":  { color: "#F97316", bg: "rgba(249,115,22,0.12)",   Icon: Camera },
  "Reunião":   { color: "#3B82F6", bg: "rgba(59,130,246,0.12)",   Icon: Users },
  "Entrega":   { color: "#10B981", bg: "rgba(16,185,129,0.12)",   Icon: Package },
  "Campanha":  { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)",   Icon: Rocket },
  "Criativo":  { color: "#EC4899", bg: "rgba(236,72,153,0.12)",   Icon: Palette },
  "Aprovação": { color: "#14B8A6", bg: "rgba(20,184,166,0.12)",   Icon: CheckCircle2 },
  "Captação":  { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",   Icon: Aperture },
  "Briefing":  { color: "#64748B", bg: "rgba(100,116,139,0.12)",  Icon: ClipboardList },
  "Meta Ads":  { color: "#EF4444", bg: "rgba(239,68,68,0.12)",    Icon: TrendingUp },
  "Análise":   { color: "#6366F1", bg: "rgba(99,102,241,0.12)",   Icon: BarChart2 },
  "Ajuste":    { color: "#9CA3AF", bg: "rgba(156,163,175,0.12)",  Icon: Wrench },
  "Conteúdo":  { color: "#06B6D4", bg: "rgba(6,182,212,0.12)",    Icon: FileText },
  "Outro":     { color: "#7C3AED", bg: "rgba(124,58,237,0.12)",   Icon: Zap },
};

const CATEGORIES = Object.keys(CAT_CFG);
function getCat(c: string) { return CAT_CFG[c] ?? DEFAULT_CAT; }

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG = {
  PLANNED:     { label: "Registrado",   color: "#6B7280", bg: "rgba(107,114,128,0.12)", next: "IN_PROGRESS" as const },
  IN_PROGRESS: { label: "Em andamento", color: "#D97706", bg: "rgba(217,119,6,0.12)",   next: "REVIEW"      as const },
  REVIEW:      { label: "Aguardando",   color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  next: "DONE"        as const },
  DONE:        { label: "Entregue",     color: "#16A34A", bg: "rgba(22,163,74,0.12)",   next: "PLANNED"     as const },
  ARCHIVED:    { label: "Arquivado",    color: "#9CA3AF", bg: "rgba(156,163,175,0.12)", next: "PLANNED"     as const },
};

// ── Date helpers ───────────────────────────────────────────────────────────────

const sod     = (d: Date) => { const r = new Date(d); r.setHours(0,0,0,0); return r; };
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const MONTHS  = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const WDAYS   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function isOverdueMv(mv: Movement) {
  return mv.status !== "DONE" && mv.status !== "ARCHIVED" && sod(new Date(mv.date)) < sod(new Date());
}

// ── Group helper ───────────────────────────────────────────────────────────────

function groupMvs(mvs: Movement[]) {
  const now    = new Date();
  const today  = sod(now);
  const tom    = sod(addDays(now, 1));
  const aftom  = sod(addDays(now, 2));
  const wkEnd  = sod(addDays(now, 8));
  const active = mvs.filter(m => m.status !== "ARCHIVED");

  return {
    overdue:  active.filter(m => m.status !== "DONE" && sod(new Date(m.date)) < today),
    today:    active.filter(m => sameDay(sod(new Date(m.date)), today)),
    tomorrow: active.filter(m => sameDay(sod(new Date(m.date)), tom) && m.status !== "DONE"),
    thisWeek: active.filter(m => { const d = sod(new Date(m.date)); return d >= aftom && d < wkEnd && m.status !== "DONE"; }),
    later:    active.filter(m => { const d = sod(new Date(m.date)); return d >= wkEnd && m.status !== "DONE"; }),
    done:     mvs.filter(m => m.status === "DONE")
                 .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  };
}

// ── Week Strip ─────────────────────────────────────────────────────────────────

function WeekStrip({ movements }: { movements: Movement[] }) {
  const today = new Date();
  const days  = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
      {days.map((day, i) => {
        const isToday = i === 0;
        const dayMvs  = movements.filter(m => sameDay(new Date(m.date), day));
        const hasOver = dayMvs.some(isOverdueMv);

        return (
          <div
            key={i}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              gap: 4, padding: "8px 4px", borderRadius: 10,
              border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
              background: isToday ? "var(--accent-soft)" : "var(--bg-surface)",
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: isToday ? "var(--accent)" : "var(--text-muted)",
            }}>
              {WDAYS[day.getDay()]}
            </span>
            <span style={{
              fontSize: 14, fontWeight: isToday ? 800 : 400, lineHeight: 1,
              color: isToday ? "var(--accent)" : "var(--text-primary)",
            }}>
              {day.getDate()}
            </span>
            <div style={{ minHeight: 6, display: "flex", gap: 2, justifyContent: "center" }}>
              {dayMvs.slice(0, 3).map((mv, j) => (
                <span
                  key={j}
                  style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: hasOver && isOverdueMv(mv) ? "#EF4444" : getCat(mv.category).color,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, count, accent = "var(--text-muted)" }: { label: string; count: number; accent?: string }) {
  if (count === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "24px 0 10px" }}>
      <span style={{
        fontSize: 10, fontWeight: 800, textTransform: "uppercase",
        letterSpacing: "0.08em", color: accent, whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 20,
        background: accent, color: "#fff",
      }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// ── Movement Card ──────────────────────────────────────────────────────────────

function MvCard({ mv, onStatusChange, onDelete }: {
  mv: Movement;
  onStatusChange: (id: string, s: Movement["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const cat     = getCat(mv.category);
  const sCfg    = STATUS_CFG[mv.status];
  const isDone  = mv.status === "DONE";
  const overdue = isOverdueMv(mv);
  const CatIcon = cat.Icon as React.ElementType;

  return (
    <div
      style={{
        display: "flex", alignItems: "stretch",
        borderRadius: 10,
        border: `1px solid ${overdue && !isDone ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
        background: isDone
          ? "var(--bg-base)"
          : overdue
            ? "rgba(239,68,68,0.04)"
            : "var(--bg-surface)",
        overflow: "hidden",
        opacity: isDone ? 0.55 : 1,
        transition: "opacity 150ms, box-shadow 150ms",
      }}
      onMouseEnter={e => { if (!isDone) (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
    >
      {/* Left color bar */}
      <div style={{
        width: 3, flexShrink: 0, alignSelf: "stretch",
        background: isDone ? "var(--border)" : overdue ? "#EF4444" : cat.color,
      }} />

      {/* Category icon */}
      <div style={{ padding: "10px 10px 10px 12px", display: "flex", alignItems: "center", flexShrink: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: cat.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CatIcon size={14} color={isDone ? "var(--text-muted)" : cat.color} />
        </div>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, padding: "10px 0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <span style={{
          fontSize: 13, fontWeight: 500, lineHeight: "18px",
          color: isDone ? "var(--text-muted)" : "var(--text-primary)",
          textDecoration: isDone ? "line-through" : "none",
          display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          paddingRight: 8,
        }}>
          {mv.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: isDone ? "var(--text-muted)" : cat.color }}>
            {mv.category}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>·</span>
          <span style={{
            fontSize: 10,
            color: overdue && !isDone ? "#EF4444" : "var(--text-muted)",
            fontWeight: overdue && !isDone ? 700 : 400,
          }}>
            {overdue && !isDone ? "⚠ " : ""}{fmtDate(mv.date)}
          </span>
          {mv.priority === "CRITICAL" && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.1)", padding: "1px 5px", borderRadius: 4 }}>
              CRÍTICO
            </span>
          )}
          {mv.priority === "HIGH" && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#D97706", background: "rgba(217,119,6,0.1)", padding: "1px 5px", borderRadius: 4 }}>
              ALTO
            </span>
          )}
        </div>
      </div>

      {/* Status pill + delete */}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onStatusChange(mv.id, sCfg.next)}
          title={`Avançar para ${STATUS_CFG[sCfg.next].label}`}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 20, border: "none",
            background: sCfg.bg, color: sCfg.color,
            fontSize: 10, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap", transition: "filter 120ms",
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.filter = "brightness(0.88)")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.filter = "none")}
        >
          {isDone && <Check size={9} />}
          {sCfg.label}
        </button>
        <button
          onClick={() => onDelete(mv.id)}
          style={{
            border: "none", background: "transparent", cursor: "pointer",
            color: "var(--text-muted)", padding: 2, display: "flex",
            opacity: 0.35, flexShrink: 0,
          }}
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Quick Add ──────────────────────────────────────────────────────────────────

function QuickAdd({ clientId, onAdded }: { clientId: string; onAdded: (m: Movement) => void }) {
  const [title,    setTitle]    = useState("");
  const [category, setCategory] = useState("Conteúdo");
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [saving,   setSaving]   = useState(false);
  const [focused,  setFocused]  = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId, title: title.trim(), category, date,
        status: "PLANNED", priority: "NORMAL", links: [], tags: [],
      }),
    });
    setSaving(false);
    if (res.ok) {
      const m = await res.json();
      onAdded(m);
      setTitle("");
      setFocused(false);
    }
  }

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`,
      background: "var(--bg-surface)",
      overflow: "hidden",
      transition: "border-color 150ms",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
        <Plus size={14} color={focused ? "var(--accent)" : "var(--text-muted)"} style={{ flexShrink: 0 }} />
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={e => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") { setFocused(false); setTitle(""); }
          }}
          placeholder="Registrar movimentação — gravação, reunião, entrega, aprovação..."
          style={{
            flex: 1, border: "none", background: "transparent",
            fontSize: 13, color: "var(--text-primary)", outline: "none",
          }}
        />
        {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "var(--accent)", flexShrink: 0 }} />}
      </div>

      {focused && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderTop: "1px solid var(--border)" }}>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{
              padding: "4px 8px", borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--bg-base)",
              fontSize: 12, color: "var(--text-secondary)", outline: "none",
            }}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              padding: "4px 8px", borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--bg-base)",
              fontSize: 12, color: "var(--text-secondary)", outline: "none",
            }}
          />
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setFocused(false); setTitle(""); }}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <X size={13} />
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: title.trim() ? "var(--accent)" : "var(--bg-elevated)",
              color: title.trim() ? "#fff" : "var(--text-muted)",
              fontSize: 12, fontWeight: 600,
              cursor: title.trim() ? "pointer" : "default",
              transition: "background 150ms, color 150ms",
            }}
          >
            <Zap size={11} /> Registrar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MovimentoTab({ clientId }: { clientId: string }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showDone,  setShowDone]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/movements?clientId=${clientId}`);
    if (res.ok) setMovements(await res.json());
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: string, status: Movement["status"]) {
    setMovements(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    await fetch(`/api/movements/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function handleDelete(id: string) {
    setMovements(prev => prev.filter(m => m.id !== id));
    await fetch(`/api/movements/${id}`, { method: "DELETE" });
  }

  const grp        = groupMvs(movements);
  const hasContent = movements.filter(m => m.status !== "ARCHIVED").length > 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 48px" }}>

      {/* Week strip */}
      {movements.length > 0 && <WeekStrip movements={movements} />}

      {/* Quick add */}
      <QuickAdd clientId={clientId} onAdded={m => setMovements(prev => [m, ...prev])} />

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasContent && (
        <div style={{ textAlign: "center", padding: "52px 0", color: "var(--text-muted)" }}>
          <Zap size={36} style={{ opacity: 0.12, margin: "0 auto 14px", display: "block" }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
            Nenhuma movimentação registrada
          </p>
          <p style={{ fontSize: 12, opacity: 0.65, maxWidth: 320, margin: "0 auto" }}>
            Registre gravações, reuniões, entregas, aprovações e tudo que acontece com este cliente.
          </p>
        </div>
      )}

      {/* ── Overdue ── */}
      <SectionHeader label="Em atraso" count={grp.overdue.length} accent="#EF4444" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {grp.overdue.map(mv => (
          <MvCard key={mv.id} mv={mv} onStatusChange={handleStatusChange} onDelete={handleDelete} />
        ))}
      </div>

      {/* ── Today ── */}
      <SectionHeader label="Hoje" count={grp.today.length} accent="var(--accent)" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {grp.today.map(mv => (
          <MvCard key={mv.id} mv={mv} onStatusChange={handleStatusChange} onDelete={handleDelete} />
        ))}
      </div>

      {/* ── Tomorrow ── */}
      <SectionHeader label="Amanhã" count={grp.tomorrow.length} accent="var(--blue)" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {grp.tomorrow.map(mv => (
          <MvCard key={mv.id} mv={mv} onStatusChange={handleStatusChange} onDelete={handleDelete} />
        ))}
      </div>

      {/* ── This week ── */}
      <SectionHeader label="Esta semana" count={grp.thisWeek.length} accent="var(--text-secondary)" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {grp.thisWeek.map(mv => (
          <MvCard key={mv.id} mv={mv} onStatusChange={handleStatusChange} onDelete={handleDelete} />
        ))}
      </div>

      {/* ── Later ── */}
      <SectionHeader label="Mais adiante" count={grp.later.length} accent="var(--text-muted)" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {grp.later.map(mv => (
          <MvCard key={mv.id} mv={mv} onStatusChange={handleStatusChange} onDelete={handleDelete} />
        ))}
      </div>

      {/* ── Done (collapsible) ── */}
      {grp.done.length > 0 && (
        <>
          <button
            onClick={() => setShowDone(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              margin: "24px 0 10px", width: "100%",
              border: "none", background: "transparent",
              cursor: "pointer", padding: 0,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#16A34A" }}>
              Concluídos
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 20, background: "#16A34A", color: "#fff" }}>
              {grp.done.length}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            {showDone ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
          </button>
          {showDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {grp.done.map(mv => (
                <MvCard key={mv.id} mv={mv} onStatusChange={handleStatusChange} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Refresh */}
      {hasContent && (
        <div style={{ textAlign: "center", marginTop: 36 }}>
          <button
            onClick={load}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              border: "1px solid var(--border)", background: "transparent",
              borderRadius: 8, padding: "6px 14px",
              fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            <RefreshCw size={10} /> Atualizar
          </button>
        </div>
      )}
    </div>
  );
}
