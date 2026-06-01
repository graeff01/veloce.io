"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  AlertTriangle, Loader2, Plus, ChevronLeft, ChevronRight,
  GripVertical, Calendar, Flag, X, Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";

interface Task {
  id: string;
  title: string;
  type: string | null;
  status: Status;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  dueDate: string;
  blocker: string | null;
  assignee: { id: string; name: string } | null;
  checklists: { id: string; text: string; done: boolean; order: number }[];
  planMonth: number | null;
  planYear: number | null;
  order: number;
}

// ── Column config ──────────────────────────────────────────────────────────────

const COLUMNS: { key: Status; label: string; color: string; soft: string; accent: string }[] = [
  { key: "TODO",        label: "A fazer",     color: "#64748B", soft: "rgba(100,116,139,0.08)", accent: "#94A3B8" },
  { key: "IN_PROGRESS", label: "Em execução", color: "#2563EB", soft: "rgba(37,99,235,0.08)",   accent: "#60A5FA" },
  { key: "REVIEW",      label: "Revisão",     color: "#D97706", soft: "rgba(217,119,6,0.08)",   accent: "#FCD34D" },
  { key: "DONE",        label: "Concluído",   color: "#16A34A", soft: "rgba(22,163,74,0.08)",   accent: "#4ADE80" },
];

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "#DC2626",
  HIGH:     "#D97706",
  NORMAL:   "var(--text-muted)",
  LOW:      "var(--text-muted)",
};

const TYPE_COLOR: Record<string, string> = {
  "Post Feed":  "#4338CA",
  "Story":      "#15803D",
  "Reels":      "#C2410C",
  "Campanha":   "#B45309",
  "Criativo":   "#0F766E",
  "Relatório":  "#475569",
  "Copy":       "#1D4ED8",
  "Google Ads": "#92400E",
  "TikTok Ads": "#7E22CE",
};

function typeColor(type: string | null) {
  if (!type) return "#6366F1";
  return TYPE_COLOR[type] ?? "#6366F1";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dd}/${mm}`;
}

function isOverdue(task: Task) {
  return task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

// ── Main component ─────────────────────────────────────────────────────────────

const TASK_TAGS = [
  "Post Feed", "Story", "Reels", "Campanha", "Criativo",
  "Relatório", "Copy", "Google Ads", "TikTok Ads", "Outro",
];

export function KanbanBoard({ clientId, clientName }: { clientId: string; clientName: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle]     = useState("");
  const [newType, setNewType]       = useState("");
  const [saving, setSaving]         = useState(false);

  // Rollover: archive DONE tasks from past months once per session
  const rolloverDone = useRef(false);

  // Drag state
  const dragTaskId   = useRef<string | null>(null);
  const dragOverCol  = useRef<Status | null>(null);
  const dragOverIdx  = useRef<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overCol, setOverCol]   = useState<Status | null>(null);
  const [overIdx, setOverIdx]   = useState<number | null>(null);

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/deliverables?month=${month}&year=${year}`);
    if (res.ok) {
      const data = await res.json();
      const all: Task[] = data.groups.flatMap((g: { tasks: Task[] }) => g.tasks);
      all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setTasks(all);
    }
    setLoading(false);
  }, [clientId, month, year]);

  useEffect(() => { load(); }, [load]);

  // Run rollover once per session when viewing current month
  useEffect(() => {
    if (isCurrentMonth && !rolloverDone.current) {
      rolloverDone.current = true;
      fetch("/api/tasks/rollover", { method: "POST" }).then(r => {
        if (r.ok) r.json().then(d => { if (d.archived > 0) load(); });
      }).catch(() => {});
    }
  }, [isCurrentMonth, load]);

  function openCreate() {
    setNewTitle("");
    setNewType("");
    setShowCreate(true);
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        type: newType || undefined,
        planMonth: month,
        planYear: year,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setShowCreate(false);
      load();
    }
  }

  async function handleDeleteTask(taskId: string) {
    const snapshot = tasks;
    // Optimistic removal
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      const ct = res.headers.get("content-type") ?? "";
      // The server confirms with JSON { ok: true }. If we get a non-OK status
      // or an HTML response (e.g. an auth redirect to /login), the delete did
      // NOT persist — restore the card so the UI matches the database.
      if (!res.ok || !ct.includes("application/json")) {
        setTasks(snapshot);
        alert("Não foi possível excluir a tarefa. Faça login novamente e tente de novo.");
      }
    } catch {
      setTasks(snapshot);
      alert("Falha de rede ao excluir a tarefa. Tente novamente.");
    }
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, taskId: string) {
    dragTaskId.current = taskId;
    setDragging(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
  }

  function handleDragEnd() {
    dragTaskId.current = null;
    setDragging(null);
    setOverCol(null);
    setOverIdx(null);
  }

  function handleDragOver(e: React.DragEvent, col: Status, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverCol.current = col;
    dragOverIdx.current = idx;
    setOverCol(col);
    setOverIdx(idx);
  }

  function handleDrop(e: React.DragEvent, targetStatus: Status) {
    e.preventDefault();
    const id = dragTaskId.current;
    if (!id) return;

    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const targetIdx = dragOverIdx.current ?? 0;
    const colTasks = tasks
      .filter(t => t.status === targetStatus && t.id !== id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    colTasks.splice(targetIdx, 0, { ...task, status: targetStatus });

    const newOrders = colTasks.map((t, i) => ({ id: t.id, order: i }));
    const orderedIds = colTasks.map(t => t.id);

    // Optimistic update
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.id === id) return { ...t, status: targetStatus };
        const found = newOrders.find(o => o.id === t.id);
        if (found) return { ...t, order: found.order };
        return t;
      });
      return updated;
    });

    // API call
    fetch(`/api/tasks/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: targetStatus,
        orderedIds,
      }),
    }).catch(() => load());

    setDragging(null);
    setOverCol(null);
    setOverIdx(null);
    dragTaskId.current = null;
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const tasksByCol = (col: Status) =>
    tasks
      .filter(t => t.status === col)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const total = tasks.length;
  const done  = tasks.filter(t => t.status === "DONE").length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue = tasks.filter(t => isOverdue(t)).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)", flexShrink: 0,
        gap: 20,
      }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={prevMonth} style={navBtn}><ChevronLeft size={14} /></button>
          <div style={{ textAlign: "center", minWidth: 148 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {MONTHS[month - 1]} {year}
            </span>
            {isCurrentMonth && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 7px", borderRadius: 20 }}>
                hoje
              </span>
            )}
          </div>
          <button onClick={nextMonth} style={navBtn}><ChevronRight size={14} /></button>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, maxWidth: 360 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${pct}%`,
              background: pct >= 80 ? "#16A34A" : pct >= 40 ? "#D97706" : "var(--accent)",
              transition: "width 500ms cubic-bezier(.4,0,.2,1)",
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", minWidth: 44 }}>
            {done}/{total}
          </span>
          {overdue > 0 && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 600, color: "#DC2626",
              background: "rgba(220,38,38,0.08)", padding: "3px 9px", borderRadius: 20,
            }}>
              <AlertTriangle size={10} /> {overdue} atraso
            </span>
          )}
        </div>

        {/* Right side: client label + new task button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
            {clientName}
          </span>
          <button
            onClick={openCreate}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 8,
              background: "var(--accent)", color: "#fff",
              border: "none",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(124,58,237,0.25)",
              transition: "opacity 150ms ease",
            }}
          >
            <Plus size={12} /> Nova tarefa
          </button>
        </div>
      </div>

      {/* ── Create task modal ────────────────────────────── */}
      {showCreate && typeof window !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 90,
            background: "rgba(15,23,42,0.45)", backdropFilter: "blur(10px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 16px",
          }}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            width: "100%", maxWidth: 520,
            boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 22px 14px",
              borderBottom: "1px solid var(--border)",
            }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Nova tarefa
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "3px 0 0" }}>
                  {MONTHS[month - 1]} {year} · {clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleCreateTask} style={{ padding: "20px 22px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Title */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Título *
                </label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ex: Post Feed — Lançamento..."
                  style={{
                    height: 40, padding: "0 12px",
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 9, fontSize: 13,
                    color: "var(--text-primary)", outline: "none", width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Tags */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Tag / Tipo
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TASK_TAGS.map(tag => {
                    const active = newType === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setNewType(active ? "" : tag)}
                        style={{
                          padding: "5px 12px", borderRadius: 20, fontSize: 11,
                          fontWeight: active ? 600 : 500,
                          border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                          background: active ? "var(--accent-soft)" : "var(--bg-elevated)",
                          color: active ? "var(--accent)" : "var(--text-muted)",
                          cursor: "pointer", transition: "all 100ms ease",
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{
                    padding: "8px 18px", borderRadius: 9,
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--text-muted)", fontSize: 13, cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !newTitle.trim()}
                  style={{
                    padding: "8px 22px", borderRadius: 9,
                    background: "var(--accent)", color: "#fff",
                    border: "none", fontSize: 13, fontWeight: 600,
                    cursor: saving || !newTitle.trim() ? "not-allowed" : "pointer",
                    opacity: saving || !newTitle.trim() ? 0.6 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                  Criar tarefa
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Board ───────────────────────────────────────────── */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={22} color="var(--text-muted)" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : (
        <div style={{
          flex: 1, overflowX: "auto", overflowY: "hidden",
          display: "flex", gap: 12, padding: "16px 20px",
          minWidth: 0,
        }}>
          {COLUMNS.map(col => {
            const colTasks = tasksByCol(col.key);
            const isDraggingOver = overCol === col.key;

            return (
              <Column
                key={col.key}
                col={col}
                tasks={colTasks}
                isDraggingOver={isDraggingOver}
                overIdx={isDraggingOver ? overIdx : null}
                draggingId={dragging}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDelete={handleDeleteTask}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────────

function Column({
  col, tasks, isDraggingOver, overIdx, draggingId,
  onDragOver, onDrop, onDragStart, onDragEnd, onDelete,
}: {
  col: typeof COLUMNS[number];
  tasks: Task[];
  isDraggingOver: boolean;
  overIdx: number | null;
  draggingId: string | null;
  onDragOver: (e: React.DragEvent, col: Status, idx: number) => void;
  onDrop: (e: React.DragEvent, col: Status) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        flex: 1, minWidth: 220,
        background: isDraggingOver ? col.soft : "var(--bg-elevated)",
        border: `1.5px solid ${isDraggingOver ? col.color + "55" : "var(--border)"}`,
        borderRadius: 14,
        transition: "background 150ms ease, border-color 150ms ease",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e, col.key, tasks.length);
      }}
      onDrop={(e) => onDrop(e, col.key)}
    >
      {/* Column header */}
      <div style={{
        padding: "12px 14px 10px",
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: col.color, flexShrink: 0,
          boxShadow: `0 0 0 3px ${col.color}20`,
        }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", flex: 1, letterSpacing: "-0.01em" }}>
          {col.label}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: tasks.length > 0 ? col.color : "var(--text-muted)",
          background: tasks.length > 0 ? col.soft : "transparent",
          padding: "1px 7px", borderRadius: 20,
          minWidth: 22, textAlign: "center",
        }}>
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "8px 8px",
        display: "flex", flexDirection: "column", gap: 0,
      }}>
        {tasks.map((task, idx) => (
          <div key={task.id}>
            {/* Drop indicator above */}
            {isDraggingOver && overIdx === idx && draggingId !== task.id && (
              <DropLine color={col.color} />
            )}
            <KanbanCard
              task={task}
              isDragging={draggingId === task.id}
              colColor={col.color}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={(e) => {
                e.stopPropagation();
                onDragOver(e, col.key, idx);
              }}
              onDelete={onDelete}
            />
          </div>
        ))}

        {/* Drop indicator at end of column */}
        {isDraggingOver && (overIdx === null || overIdx >= tasks.length) && (
          <DropLine color={col.color} />
        )}

        {/* Empty state */}
        {tasks.length === 0 && !isDraggingOver && (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "28px 12px", opacity: 0.4,
          }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              Arraste uma tarefa aqui
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drop Line ──────────────────────────────────────────────────────────────────

function DropLine({ color }: { color: string }) {
  return (
    <div style={{
      height: 3, borderRadius: 2,
      background: color,
      margin: "3px 4px",
      boxShadow: `0 0 8px ${color}60`,
      animation: "pulse 1s ease infinite",
    }} />
  );
}

// ── Kanban Card ────────────────────────────────────────────────────────────────

function KanbanCard({
  task, isDragging, colColor, onDragStart, onDragEnd, onDragOver, onDelete,
}: {
  task: Task;
  isDragging: boolean;
  colColor: string;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDelete: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const overdue  = isOverdue(task);
  const clDone   = task.checklists.filter(c => c.done).length;
  const clTotal  = task.checklists.length;
  // accent color = column status color (overdue overrides to red)
  const accentCol = overdue ? "#DC2626" : colColor;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: isDragging ? "var(--bg-surface)" : hover ? `color-mix(in srgb, ${accentCol} 6%, var(--bg-elevated))` : `color-mix(in srgb, ${accentCol} 4%, var(--bg-surface))`,
        border: `1px solid ${isDragging ? colColor + "50" : hover ? colColor + "35" : "var(--border)"}`,
        borderLeft: `3px solid ${accentCol}`,
        borderRadius: 10,
        padding: "10px 10px 10px 12px",
        marginBottom: 6,
        cursor: "grab",
        opacity: isDragging ? 0.35 : 1,
        transform: hover && !isDragging ? "translateY(-1px)" : "none",
        boxShadow: hover && !isDragging ? `0 4px 14px ${colColor}20` : "none",
        transition: "opacity 100ms, transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
        userSelect: "none",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      {/* Top row: drag handle + title + delete */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <GripVertical
          size={13}
          style={{ color: "var(--text-muted)", opacity: hover ? 0.5 : 0.15, flexShrink: 0, marginTop: 1, transition: "opacity 120ms" }}
        />
        <span style={{
          fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)",
          lineHeight: "17px", flex: 1,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {task.title}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(task.id); }}
          title="Excluir tarefa"
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 2,
            color: "var(--text-muted)", borderRadius: 4, flexShrink: 0,
            opacity: hover ? 0.5 : 0, transition: "opacity 120ms, color 120ms",
            display: "flex", alignItems: "center",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Type badge — uses status color tint so it integrates visually */}
      {task.type && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start",
          background: accentCol + "14", border: `1px solid ${accentCol}28`,
          padding: "2px 8px", borderRadius: 20,
          fontSize: 10, fontWeight: 600, color: accentCol,
        }}>
          {task.type}
        </div>
      )}

      {/* Checklist mini bar */}
      {clTotal > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2, width: `${Math.round((clDone / clTotal) * 100)}%`,
              background: clDone === clTotal ? "#16A34A" : colColor,
              transition: "width 300ms ease",
            }} />
          </div>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
            {clDone}/{clTotal}
          </span>
        </div>
      )}

      {/* Footer: date + priority + assignee + blocker */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>

        <span style={{
          display: "flex", alignItems: "center", gap: 3,
          fontSize: 10, fontWeight: overdue ? 700 : 500,
          color: overdue ? "#DC2626" : "var(--text-muted)",
        }}>
          <Calendar size={9} style={{ opacity: 0.7 }} />
          {fmtDate(task.dueDate)}
        </span>

        {task.priority !== "NORMAL" && task.priority !== "LOW" && (
          <span style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 10, fontWeight: 600,
            color: PRIORITY_COLOR[task.priority],
          }}>
            <Flag size={9} />
            {task.priority === "CRITICAL" ? "Crítica" : "Alta"}
          </span>
        )}

        {task.blocker && (
          <span title={task.blocker} style={{ display: "flex", alignItems: "center" }}>
            <AlertTriangle size={11} color="#D97706" />
          </span>
        )}

        {task.assignee && (
          <span
            title={task.assignee.name}
            style={{
              marginLeft: "auto",
              width: 20, height: 20, borderRadius: "50%",
              background: "var(--accent-soft)", color: "var(--accent)",
              fontSize: 8, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {task.assignee.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "var(--text-muted)", padding: 0,
};
