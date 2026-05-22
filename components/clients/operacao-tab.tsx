"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Circle,
  AlertTriangle, RefreshCw, Zap, Plus, Clock,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { ApplyPlanWizard } from "@/components/plans/apply-plan-wizard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
}

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
  summary: {
    total: number;
    done: number;
    overdue: number;
    hasPlan: boolean;
    planName: string | null;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TYPE_COLOR: Record<string, { bg: string; color: string; dot: string }> = {
  "Post Feed":   { bg: "#EEF2FF", color: "#4F46E5", dot: "#4F46E5" },
  "Story":       { bg: "#F0FDF4", color: "#16A34A", dot: "#16A34A" },
  "Reels":       { bg: "#FFF7ED", color: "#EA580C", dot: "#EA580C" },
  "Campanha":    { bg: "#FEF3C7", color: "#D97706", dot: "#D97706" },
  "Criativo":    { bg: "#F0FDFA", color: "#0D9488", dot: "#0D9488" },
  "Relatório":   { bg: "#F8FAFC", color: "#64748B", dot: "#64748B" },
  "Copy":        { bg: "#EFF6FF", color: "#2563EB", dot: "#2563EB" },
  "Outros":      { bg: "var(--bg-elevated)", color: "var(--text-secondary)", dot: "var(--text-muted)" },
};

function getTypeStyle(type: string) {
  return TYPE_COLOR[type] ?? TYPE_COLOR["Outros"];
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

function isOverdue(task: Task) {
  return task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function OperacaoTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<DeliverableData | null>(null);
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
      // Default: expand all groups
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
    setTogglingId(task.id);
    const next = task.status === "DONE" ? "TODO" : "DONE";
    const res = await fetch(`/api/tasks/${task.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) => t.id === task.id ? { ...t, status: next } : t),
            done: g.tasks.filter((t) => (t.id === task.id ? next === "DONE" : t.status === "DONE")).length,
            pct: Math.round(
              (g.tasks.filter((t) => (t.id === task.id ? next === "DONE" : t.status === "DONE")).length /
                (g.planned || g.total)) * 100
            ),
          })),
          summary: {
            ...prev.summary,
            done: prev.summary.done + (next === "DONE" ? 1 : -1),
          },
        };
      });
    }
    setTogglingId(null);
  }

  async function handleRenew() {
    setRenewing(true);
    const res = await fetch(`/api/clients/${clientId}/renew-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setRenewing(false);
    if (res.ok) load();
    else {
      const d = await res.json();
      if (d.error && d.error !== "Tarefas já existem para este mês") alert(d.error);
      else load();
    }
  }

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const totalPct = data
    ? data.summary.total > 0
      ? Math.round((data.summary.done / data.summary.total) * 100)
      : 0
    : 0;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 780 }}>
      {/* Month navigator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={prevMonth}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px 6px", borderRadius: 6, display: "flex", alignItems: "center" }}
          >
            <ChevronLeft size={16} />
          </button>
          <div style={{ minWidth: 160, textAlign: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
            {isCurrentMonth && (
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 600,
                background: "var(--accent-soft)", color: "var(--accent)",
                padding: "1px 7px", borderRadius: 20,
              }}>
                mês atual
              </span>
            )}
          </div>
          <button
            onClick={nextMonth}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px 6px", borderRadius: 6, display: "flex", alignItems: "center" }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {data?.summary.hasPlan && (
            <button
              onClick={handleRenew}
              disabled={renewing}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                border: "1px solid var(--border)", borderRadius: 7,
                background: "var(--bg-surface)", color: "var(--text-muted)",
                padding: "6px 12px", fontSize: 12, cursor: "pointer",
                opacity: renewing ? 0.6 : 1,
              }}
            >
              <Zap size={12} /> {renewing ? "Gerando..." : "Gerar entregas"}
            </button>
          )}
          <button
            onClick={() => setPlanWizardOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              border: "1px solid var(--border)", borderRadius: 7,
              background: "var(--bg-surface)", color: "var(--text-secondary)",
              padding: "6px 12px", fontSize: 12, cursor: "pointer",
            }}
          >
            <RefreshCw size={12} /> Trocar plano
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", color: "var(--text-muted)" }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {/* Empty: no plan and no tasks */}
      {!loading && data && data.summary.total === 0 && !data.summary.hasPlan && (
        <div style={{
          border: "1px dashed var(--border)", borderRadius: 14,
          padding: "48px 32px", textAlign: "center",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, margin: "0 auto 16px",
            background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Plus size={22} color="var(--accent)" />
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
            Nenhum plano aplicado
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" }}>
            Aplique um plano de serviços para gerar automaticamente os entregáveis deste cliente.
          </p>
          <button
            onClick={() => setPlanWizardOpen(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus size={14} /> Aplicar plano
          </button>
        </div>
      )}

      {/* Empty: has plan but no tasks for this month */}
      {!loading && data && data.summary.total === 0 && data.summary.hasPlan && (
        <div style={{
          border: "1px dashed var(--border)", borderRadius: 14,
          padding: "40px 32px", textAlign: "center",
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            Sem entregas para {MONTH_NAMES[month - 1]}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Plano ativo: <strong>{data.summary.planName}</strong>
          </p>
          <button
            onClick={handleRenew}
            disabled={renewing}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", opacity: renewing ? 0.6 : 1,
            }}
          >
            <Zap size={14} /> {renewing ? "Gerando..." : "Gerar entregas do mês"}
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && data && data.summary.total > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Summary bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16, marginBottom: 16,
            padding: "12px 16px", borderRadius: 10,
            background: "var(--bg-surface)", border: "1px solid var(--border)",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {data.summary.done}/{data.summary.total} entregues
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: totalPct >= 70 ? "var(--green)" : totalPct >= 40 ? "var(--amber)" : "var(--red)",
                }}>
                  {totalPct}%
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
                <div style={{
                  width: `${totalPct}%`, height: "100%", borderRadius: 3,
                  background: totalPct >= 70 ? "var(--green)" : totalPct >= 40 ? "var(--amber)" : "var(--red)",
                  transition: "width 500ms ease-out",
                }} />
              </div>
            </div>
            {data.summary.overdue > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 7,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                fontSize: 12, fontWeight: 600, color: "var(--red)", flexShrink: 0,
              }}>
                <AlertTriangle size={12} />
                {data.summary.overdue} em atraso
              </div>
            )}
          </div>

          {/* Deliverable groups */}
          {data.groups.map((group) => {
            const style = getTypeStyle(group.type);
            const expanded = expandedGroups[group.type] ?? true;
            const pct = group.planned > 0
              ? Math.round((group.done / group.planned) * 100)
              : group.total > 0 ? Math.round((group.done / group.total) * 100) : 0;
            const barColor = pct >= 100 ? "var(--green)" : pct >= 60 ? "var(--amber)" : group.overdue > 0 ? "var(--red)" : "var(--accent)";
            const allDone = group.done >= (group.planned || group.total);

            return (
              <div
                key={group.type}
                style={{
                  border: `1px solid ${group.overdue > 0 ? "rgba(239,68,68,0.2)" : allDone ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
                  borderRadius: 12, overflow: "hidden",
                  marginBottom: 8,
                  background: allDone ? "rgba(16,185,129,0.02)" : "var(--bg-surface)",
                }}
              >
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.type]: !expanded }))}
                  style={{
                    width: "100%", background: "none", border: "none", cursor: "pointer",
                    padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                  }}
                >
                  {/* Type badge */}
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 10px", borderRadius: 20, flexShrink: 0,
                    background: style.bg, color: style.color, fontSize: 12, fontWeight: 600,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: style.dot }} />
                    {group.type}
                  </span>

                  {/* Progress inline */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 2,
                        background: barColor, transition: "width 400ms ease-out",
                      }} />
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                      {group.done}/{group.planned || group.total}
                    </span>
                  </div>

                  {/* Status badges */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {allDone && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--green)", background: "rgba(16,185,129,0.1)", padding: "2px 7px", borderRadius: 20 }}>
                        ✓ completo
                      </span>
                    )}
                    {group.overdue > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--red)", background: "rgba(239,68,68,0.08)", padding: "2px 7px", borderRadius: 20 }}>
                        {group.overdue} atrasado{group.overdue > 1 ? "s" : ""}
                      </span>
                    )}
                    {expanded ? <ChevronUp size={13} color="var(--text-muted)" /> : <ChevronDown size={13} color="var(--text-muted)" />}
                  </div>
                </button>

                {/* Task list */}
                {expanded && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {group.tasks.map((task, idx) => {
                      const done = task.status === "DONE";
                      const overdue = isOverdue(task);
                      const toggling = togglingId === task.id;
                      const isLast = idx === group.tasks.length - 1;

                      return (
                        <div
                          key={task.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 16px",
                            borderBottom: isLast ? "none" : "1px solid var(--border)",
                            background: overdue ? "rgba(239,68,68,0.02)" : "transparent",
                            transition: "background 150ms",
                          }}
                        >
                          {/* Toggle button */}
                          <button
                            type="button"
                            onClick={() => !toggling && toggleStatus(task)}
                            disabled={toggling}
                            style={{
                              background: "none", border: "none", cursor: toggling ? "default" : "pointer",
                              padding: 0, display: "flex", alignItems: "center", flexShrink: 0,
                              opacity: toggling ? 0.5 : 1,
                            }}
                          >
                            {toggling ? (
                              <Loader2 size={18} color="var(--text-muted)" style={{ animation: "spin 1s linear infinite" }} />
                            ) : done ? (
                              <CheckCircle2 size={18} color="var(--green)" />
                            ) : (
                              <Circle size={18} color={overdue ? "var(--red)" : "var(--text-muted)"} />
                            )}
                          </button>

                          {/* Title */}
                          <span style={{
                            flex: 1, fontSize: 13,
                            color: done ? "var(--text-muted)" : "var(--text-primary)",
                            fontWeight: done ? 400 : 500,
                            textDecoration: done ? "line-through" : "none",
                            textDecorationColor: "var(--text-muted)",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {task.title}
                          </span>

                          {/* Checklist progress */}
                          {task.checklists.length > 0 && !done && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                              {task.checklists.filter((c) => c.done).length}/{task.checklists.length}
                            </span>
                          )}

                          {/* Priority pill */}
                          {task.priority === "CRITICAL" && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--red)", background: "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: 20, flexShrink: 0 }}>
                              CRÍTICA
                            </span>
                          )}
                          {task.priority === "HIGH" && !done && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--amber)", background: "rgba(245,158,11,0.1)", padding: "1px 6px", borderRadius: 20, flexShrink: 0 }}>
                              ALTA
                            </span>
                          )}

                          {/* Blocker indicator */}
                          {task.blocker && !done && (
                            <span title={task.blocker}>
                              <AlertTriangle size={13} color="var(--amber)" />
                            </span>
                          )}

                          {/* Due date */}
                          <span style={{
                            fontSize: 11, flexShrink: 0,
                            color: overdue ? "var(--red)" : done ? "var(--text-muted)" : "var(--text-muted)",
                            display: "flex", alignItems: "center", gap: 3,
                          }}>
                            {overdue && !done && <AlertTriangle size={10} />}
                            <Clock size={10} />
                            {fmtDate(task.dueDate)}
                          </span>

                          {/* Assignee */}
                          {task.assignee && (
                            <span
                              title={task.assignee.name}
                              style={{
                                width: 22, height: 22, borderRadius: "50%",
                                background: "var(--accent-soft)", color: "var(--accent)",
                                fontSize: 9, fontWeight: 700,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {task.assignee.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
