"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, AlertTriangle,
  RefreshCw, Zap, Plus, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { ApplyPlanWizard } from "@/components/plans/apply-plan-wizard";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChecklistItem { id: string; text: string; done: boolean; order: number }

interface Task {
  id: string;
  title: string;
  type: string | null;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  dueDate: string;
  blocker: string | null;
  assignee: { id: string; name: string } | null;
  checklists: ChecklistItem[];
  planMonth: number | null;
  planYear: number | null;
}

interface DeliverableGroup {
  type: string;
  tasks: Task[];
  total: number;
  done: number;
  overdue: number;
  planned: number;
  pct: number;
}

interface DeliverableData {
  month: number;
  year: number;
  groups: DeliverableGroup[];
  summary: { total: number; done: number; overdue: number; hasPlan: boolean; planName: string | null };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const TYPE_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  "Post Feed":  { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  "Story":      { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" },
  "Reels":      { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
  "Campanha":   { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  "Criativo":   { bg: "#F0FDFA", color: "#0F766E", border: "#99F6E4" },
  "Relatório":  { bg: "#F8FAFC", color: "#475569", border: "#E2E8F0" },
  "Copy":       { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  "Google Ads": { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  "TikTok Ads": { bg: "#FDF4FF", color: "#7E22CE", border: "#E9D5FF" },
};

function typeStyle(type: string) {
  return TYPE_COLOR[type] ?? { bg: "var(--bg-elevated)", color: "var(--text-secondary)", border: "var(--border)" };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
}

function isOverdue(task: Task) {
  return task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function OperacaoTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const now = new Date();
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [year, setYear]     = useState(now.getFullYear());
  const [data, setData]     = useState<DeliverableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [renewing, setRenewing] = useState(false);
  const [planWizardOpen, setPlanWizardOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/deliverables?month=${month}&year=${year}`);
    if (res.ok) {
      const d: DeliverableData = await res.json();
      setData(d);
      const expanded: Record<string, boolean> = {};
      d.groups.forEach((g) => { expanded[g.type] = true; });
      setExpandedGroups(expanded);
    }
    setLoading(false);
  }, [clientId, month, year]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  async function toggleStatus(task: Task) {
    if (togglingId) return;
    setTogglingId(task.id);
    const next = task.status === "DONE" ? "TODO" : "DONE";

    // Optimistic update first
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map((g) => {
          const newTasks = g.tasks.map((t) => t.id === task.id ? { ...t, status: next as Task["status"] } : t);
          const newDone = newTasks.filter((t) => t.status === "DONE").length;
          const newOverdue = newTasks.filter((t) => isOverdue(t)).length;
          return {
            ...g,
            tasks: newTasks,
            done: newDone,
            overdue: newOverdue,
            pct: Math.round((newDone / (g.planned || g.total)) * 100),
          };
        }),
        summary: {
          ...prev.summary,
          done: prev.summary.done + (next === "DONE" ? 1 : -1),
          overdue: next === "DONE"
            ? Math.max(0, prev.summary.overdue - (isOverdue(task) ? 1 : 0))
            : prev.summary.overdue + (new Date(task.dueDate) < now ? 1 : 0),
        },
      };
    });

    const res = await fetch(`/api/tasks/${task.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    // Revert on failure
    if (!res.ok) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) => {
            const reverted = g.tasks.map((t) => t.id === task.id ? { ...t, status: task.status } : t);
            const rd = reverted.filter((t) => t.status === "DONE").length;
            return { ...g, tasks: reverted, done: rd, pct: Math.round((rd / (g.planned || g.total)) * 100) };
          }),
          summary: { ...prev.summary, done: prev.summary.done + (next === "DONE" ? -1 : 1) },
        };
      });
    }
    setTogglingId(null);
  }

  async function handleRenew() {
    setRenewing(true);
    const res = await fetch(`/api/clients/${clientId}/renew-plan`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    setRenewing(false);
    load();
    if (!res.ok) {
      const d = await res.json();
      if (d.error && d.error !== "Tarefas já existem para este mês") alert(d.error);
    }
  }

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const totalPct = data && data.summary.total > 0
    ? Math.round((data.summary.done / data.summary.total) * 100)
    : 0;
  const progressColor = totalPct >= 80 ? "#16A34A" : totalPct >= 50 ? "#D97706" : "#DC2626";

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 820, padding: "24px 28px" }}>

        {/* ── Top bar ──────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>

          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={prevMonth}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-surface)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--text-muted)",
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <div style={{
              minWidth: 172, textAlign: "center",
              padding: "0 12px",
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                {MONTH_NAMES[month - 1]} {year}
              </span>
              {isCurrentMonth && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 600,
                  background: "var(--accent-soft)", color: "var(--accent)",
                  padding: "2px 7px", borderRadius: 20,
                }}>
                  atual
                </span>
              )}
            </div>
            <button
              onClick={nextMonth}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-surface)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--text-muted)",
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            {data?.summary.hasPlan && (
              <button
                onClick={handleRenew}
                disabled={renewing}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  border: "1px solid var(--border)", borderRadius: 8,
                  background: "var(--bg-surface)", color: "var(--text-muted)",
                  padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  opacity: renewing ? 0.6 : 1, transition: "opacity 150ms",
                }}
              >
                <Zap size={12} /> {renewing ? "Gerando..." : "Gerar entregas"}
              </button>
            )}
            <button
              onClick={() => setPlanWizardOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                border: "1px solid var(--border)", borderRadius: 8,
                background: "var(--bg-surface)", color: "var(--text-secondary)",
                padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >
              <RefreshCw size={12} /> Trocar plano
            </button>
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────── */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "var(--text-muted)" }}>
            <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ── Empty: no plan ────────────────────────────────── */}
        {!loading && data && data.summary.total === 0 && !data.summary.hasPlan && (
          <div style={{
            border: "1.5px dashed var(--border)", borderRadius: 16,
            padding: "56px 32px", textAlign: "center",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, margin: "0 auto 18px",
              background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={24} color="var(--accent)" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
              Nenhum plano aplicado
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 22, maxWidth: 340, margin: "0 auto 22px" }}>
              Aplique um plano para gerar automaticamente os entregáveis mensais.
            </p>
            <button
              onClick={() => setPlanWizardOpen(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "var(--accent)", color: "#fff", border: "none",
                borderRadius: 10, padding: "11px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} /> Aplicar plano
            </button>
          </div>
        )}

        {/* ── Empty: has plan, no tasks ─────────────────────── */}
        {!loading && data && data.summary.total === 0 && data.summary.hasPlan && (
          <div style={{
            border: "1.5px dashed var(--border)", borderRadius: 16,
            padding: "48px 32px", textAlign: "center",
          }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
              Sem entregas para {MONTH_NAMES[month - 1]}
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Plano ativo: <strong>{data.summary.planName}</strong>
            </p>
            <button
              onClick={handleRenew}
              disabled={renewing}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "var(--accent)", color: "#fff", border: "none",
                borderRadius: 10, padding: "11px 22px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", opacity: renewing ? 0.6 : 1,
              }}
            >
              <Zap size={14} /> {renewing ? "Gerando..." : "Gerar entregas do mês"}
            </button>
          </div>
        )}

        {/* ── Content ───────────────────────────────────────── */}
        {!loading && data && data.summary.total > 0 && (
          <div>

            {/* Summary card */}
            <div style={{
              display: "flex", alignItems: "center", gap: 20,
              padding: "14px 20px", borderRadius: 12, marginBottom: 20,
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              {/* Circular progress */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <svg width={52} height={52} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={26} cy={26} r={21} fill="none" stroke="var(--bg-elevated)" strokeWidth={4} />
                  <circle
                    cx={26} cy={26} r={21}
                    fill="none" stroke={progressColor} strokeWidth={4}
                    strokeDasharray={`${2 * Math.PI * 21}`}
                    strokeDashoffset={`${2 * Math.PI * 21 * (1 - totalPct / 100)}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 600ms ease-out" }}
                  />
                </svg>
                <span style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: progressColor,
                }}>
                  {totalPct}%
                </span>
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                  {data.summary.done} de {data.summary.total} entregues
                </p>
                <div style={{ height: 5, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
                  <div style={{
                    width: `${totalPct}%`, height: "100%", borderRadius: 3,
                    background: progressColor, transition: "width 600ms ease-out",
                  }} />
                </div>
              </div>

              {/* Overdue badge */}
              {data.summary.overdue > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                  padding: "6px 12px", borderRadius: 8,
                  background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.18)",
                  fontSize: 12, fontWeight: 600, color: "#DC2626",
                }}>
                  <AlertTriangle size={12} />
                  {data.summary.overdue} em atraso
                </div>
              )}

              {/* All done celebration */}
              {totalPct === 100 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                  padding: "6px 12px", borderRadius: 8,
                  background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)",
                  fontSize: 12, fontWeight: 600, color: "#15803D",
                }}>
                  ✓ Mês completo
                </div>
              )}
            </div>

            {/* Groups */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.groups.map((group) => {
                const s = typeStyle(group.type);
                const expanded = expandedGroups[group.type] ?? true;
                const pct = group.planned > 0
                  ? Math.round((group.done / group.planned) * 100)
                  : group.total > 0 ? Math.round((group.done / group.total) * 100) : 0;
                const allDone = group.done >= (group.planned || group.total);
                const barColor = allDone ? "#16A34A" : group.overdue > 0 ? "#DC2626" : pct >= 50 ? "#D97706" : "var(--accent)";

                return (
                  <div
                    key={group.type}
                    style={{
                      borderRadius: 12, overflow: "hidden",
                      border: `1px solid ${allDone ? "rgba(22,163,74,0.2)" : group.overdue > 0 ? "rgba(220,38,38,0.15)" : "var(--border)"}`,
                      background: "var(--bg-surface)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                      transition: "box-shadow 150ms",
                    }}
                  >
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((p) => ({ ...p, [group.type]: !expanded }))}
                      style={{
                        width: "100%", background: allDone ? "rgba(22,163,74,0.03)" : "transparent",
                        border: "none", cursor: "pointer",
                        padding: "11px 16px", display: "flex", alignItems: "center", gap: 12,
                      }}
                    >
                      {/* Type pill */}
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                        padding: "3px 10px 3px 8px", borderRadius: 20,
                        background: s.bg, color: s.color,
                        border: `1px solid ${s.border}`,
                        fontSize: 11.5, fontWeight: 600, letterSpacing: "0.01em",
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, opacity: 0.7 }} />
                        {group.type}
                      </span>

                      {/* Progress bar */}
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 3,
                            background: barColor, transition: "width 500ms ease-out",
                          }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", flexShrink: 0, minWidth: 32, textAlign: "right" }}>
                          {group.done}/{group.planned || group.total}
                        </span>
                      </div>

                      {/* Badges */}
                      <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                        {allDone && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: "#15803D",
                            background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.15)",
                            padding: "2px 8px", borderRadius: 20,
                          }}>
                            ✓ completo
                          </span>
                        )}
                        {group.overdue > 0 && !allDone && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: "#DC2626",
                            background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)",
                            padding: "2px 8px", borderRadius: 20,
                          }}>
                            {group.overdue} atrasad{group.overdue > 1 ? "os" : "a"}
                          </span>
                        )}
                        <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </span>
                      </div>
                    </button>

                    {/* Task rows */}
                    {expanded && (
                      <div style={{ borderTop: "1px solid var(--border)" }}>
                        {group.tasks.map((task, idx) => {
                          const done = task.status === "DONE";
                          const overdue = isOverdue(task);
                          const toggling = togglingId === task.id;
                          const isLast = idx === group.tasks.length - 1;
                          const checklistDone = task.checklists.filter((c) => c.done).length;
                          const checklistTotal = task.checklists.length;

                          return (
                            <TaskRow
                              key={task.id}
                              task={task}
                              done={done}
                              overdue={overdue}
                              toggling={toggling}
                              isLast={isLast}
                              checklistDone={checklistDone}
                              checklistTotal={checklistTotal}
                              onToggle={() => toggleStatus(task)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Plan wizard */}
      <ApplyPlanWizard
        open={planWizardOpen}
        onClose={() => setPlanWizardOpen(false)}
        clientId={clientId}
        clientName={clientName}
        onSuccess={() => { setPlanWizardOpen(false); load(); }}
      />
    </div>
  );
}

// ── TaskRow ────────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  done,
  overdue,
  toggling,
  isLast,
  checklistDone,
  checklistTotal,
  onToggle,
}: {
  task: Task;
  done: boolean;
  overdue: boolean;
  toggling: boolean;
  isLast: boolean;
  checklistDone: number;
  checklistTotal: number;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        background: done
          ? "transparent"
          : overdue
            ? "rgba(220,38,38,0.018)"
            : hovered ? "rgba(0,0,0,0.018)" : "transparent",
        transition: "background 120ms",
      }}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        disabled={toggling}
        style={{
          flexShrink: 0, width: 20, height: 20,
          borderRadius: 6,
          border: `2px solid ${done ? "#16A34A" : overdue ? "#DC2626" : hovered ? "var(--accent)" : "var(--border-strong)"}`,
          background: done ? "#16A34A" : "transparent",
          cursor: toggling ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 150ms, background 150ms",
          padding: 0,
        }}
      >
        {toggling ? (
          <Loader2 size={11} color={done ? "#fff" : "var(--text-muted)"} style={{ animation: "spin 0.8s linear infinite" }} />
        ) : done ? (
          <svg width={11} height={11} viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5L4.5 8L9 3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      {/* Title */}
      <span style={{
        flex: 1, fontSize: 13, minWidth: 0,
        color: done ? "var(--text-muted)" : "var(--text-primary)",
        fontWeight: 500,
        textDecoration: done ? "line-through" : "none",
        textDecorationColor: "var(--border-strong)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        opacity: done ? 0.6 : 1,
        transition: "opacity 200ms, color 200ms",
      }}>
        {task.title}
      </span>

      {/* Right-side metadata */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

        {/* Checklist mini-bar */}
        {checklistTotal > 0 && !done && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: checklistTotal }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 5, height: 5, borderRadius: 2,
                    background: i < checklistDone ? "var(--accent)" : "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {checklistDone}/{checklistTotal}
            </span>
          </div>
        )}

        {/* Priority */}
        {task.priority === "CRITICAL" && !done && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#DC2626",
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)",
            padding: "1px 6px", borderRadius: 20,
          }}>
            CRÍTICA
          </span>
        )}
        {task.priority === "HIGH" && !done && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#B45309",
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)",
            padding: "1px 6px", borderRadius: 20,
          }}>
            ALTA
          </span>
        )}

        {/* Blocker */}
        {task.blocker && !done && (
          <span title={task.blocker} style={{ display: "flex", alignItems: "center" }}>
            <AlertTriangle size={13} color="#D97706" />
          </span>
        )}

        {/* Due date */}
        <span style={{
          fontSize: 11, fontWeight: 500,
          color: done ? "var(--text-muted)" : overdue ? "#DC2626" : "var(--text-muted)",
          display: "flex", alignItems: "center", gap: 3,
          opacity: done ? 0.5 : 1,
        }}>
          {overdue && !done && <AlertTriangle size={9} />}
          {fmtDate(task.dueDate)}
        </span>

        {/* Assignee avatar */}
        {task.assignee && (
          <span
            title={task.assignee.name}
            style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "var(--accent-soft)", color: "var(--accent)",
              fontSize: 9, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1.5px solid var(--accent-soft)",
            }}
          >
            {task.assignee.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
