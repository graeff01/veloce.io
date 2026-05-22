"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, Zap, Plus, Loader2, CheckCircle2, BarChart3, RotateCcw, Trash2 } from "lucide-react";
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

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const TYPE_DOT: Record<string, string> = {
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

function dot(type: string) { return TYPE_DOT[type] ?? "#6366F1"; }

function fmtDate(iso: string) {
  const d = new Date(iso);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() === lastDay) return "fim do mês";
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
}

function isOverdue(task: Task) {
  return task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function OperacaoTab({
  clientId, clientName, initialMonth, initialYear, onMonthChange,
}: {
  clientId: string; clientName: string;
  initialMonth?: number; initialYear?: number;
  onMonthChange?: (month: number, year: number) => void;
}) {
  const now = new Date();
  const [month, setMonth]       = useState(initialMonth ?? now.getMonth() + 1);
  const [year, setYear]         = useState(initialYear  ?? now.getFullYear());
  const [data, setData]         = useState<DeliverableData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/deliverables?month=${month}&year=${year}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [clientId, month, year]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear  = month === 1 ? year - 1 : year;
    setMonth(newMonth); setYear(newYear);
    onMonthChange?.(newMonth, newYear);
  }
  function nextMonth() {
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear  = month === 12 ? year + 1 : year;
    setMonth(newMonth); setYear(newYear);
    onMonthChange?.(newMonth, newYear);
  }

  async function toggleTask(task: Task) {
    if (togglingId) return;
    setTogglingId(task.id);
    const next = task.status === "DONE" ? "TODO" : "DONE";

    setData(prev => {
      if (!prev) return prev;
      const delta = next === "DONE" ? 1 : -1;
      return {
        ...prev,
        summary: { ...prev.summary, done: prev.summary.done + delta },
        groups: prev.groups.map(g => {
          const tasks = g.tasks.map(t => t.id === task.id ? { ...t, status: next as Task["status"] } : t);
          const done  = tasks.filter(t => t.status === "DONE").length;
          return { ...g, tasks, done, pct: Math.round((done / (g.planned || g.total)) * 100) };
        }),
      };
    });

    const res = await fetch(`/api/tasks/${task.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    if (!res.ok) {
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          summary: { ...prev.summary, done: prev.summary.done + (next === "DONE" ? -1 : 1) },
          groups: prev.groups.map(g => {
            const tasks = g.tasks.map(t => t.id === task.id ? { ...t, status: task.status } : t);
            const done  = tasks.filter(t => t.status === "DONE").length;
            return { ...g, tasks, done, pct: Math.round((done / (g.planned || g.total)) * 100) };
          }),
        };
      });
    }
    setTogglingId(null);
  }

  async function handleGenerate() {
    setRenewing(true);
    const res = await fetch(`/api/clients/${clientId}/renew-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year }),
    });
    setRenewing(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error) alert(d.error);
    }
    load();
  }

  async function handleRestart() {
    if (!confirm(`Reiniciar ${MONTHS[month - 1]} ${year}? Todas as tarefas do mês serão apagadas e geradas novamente do plano ativo.`)) return;
    setRestarting(true);
    const res = await fetch(`/api/clients/${clientId}/restart-month`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year }),
    });
    setRestarting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error) alert(d.error);
    }
    load();
  }

  async function handleReset() {
    if (!confirm(`Resetar cliente? Todas as tarefas de TODOS os meses serão apagadas e o mês atual será gerado novamente do plano ativo. Essa ação não pode ser desfeita.`)) return;
    setResetting(true);
    const res = await fetch(`/api/clients/${clientId}/reset`, { method: "POST" });
    setResetting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.error) alert(d.error);
      return;
    }
    // After reset, navigate to current month
    const nowDate = new Date();
    setMonth(nowDate.getMonth() + 1);
    setYear(nowDate.getFullYear());
    load();
  }

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const pct = data && data.summary.total > 0
    ? Math.round((data.summary.done / data.summary.total) * 100) : 0;
  const progressColor = pct >= 80 ? "#16A34A" : pct >= 40 ? "#D97706" : data?.summary.overdue && data.summary.overdue > 0 ? "#DC2626" : "var(--accent)";

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

      {/* ── Left: task list ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: "20px 24px 32px" }}>

        {/* Month navigator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <button onClick={prevMonth} style={navBtn}><ChevronLeft size={14} /></button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {MONTHS[month - 1]} {year}
            </span>
            {isCurrentMonth && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: "var(--accent)",
                background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 20,
              }}>
                hoje
              </span>
            )}
          </div>
          <button onClick={nextMonth} style={navBtn}><ChevronRight size={14} /></button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", color: "var(--text-muted)" }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* No plan */}
        {!loading && data && !data.summary.hasPlan && data.summary.total === 0 && (
          <EmptyState
            title="Nenhum plano ativo"
            sub="Edite o cliente e defina os entregáveis mensais para começar."
            cta="Aplicar plano"
            onCta={() => setWizardOpen(true)}
          />
        )}

        {/* Has plan, no tasks */}
        {!loading && data && data.summary.hasPlan && data.summary.total === 0 && (
          <EmptyState
            title={`Sem entregas em ${MONTHS[month - 1]}`}
            sub={`Plano ativo: ${data.summary.planName}`}
            cta={renewing ? "Gerando…" : "Gerar entregas do mês"}
            onCta={handleGenerate}
            ctaDisabled={renewing}
          />
        )}

        {/* Content */}
        {!loading && data && data.summary.total > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.groups.map((group, gi) => (
              <GroupSection
                key={group.type}
                group={group}
                togglingId={togglingId}
                onToggle={toggleTask}
                isFirst={gi === 0}
                isLast={gi === data.groups.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right: metrics panel ──────────────────────────────────────── */}
      <aside style={{
        width: 252,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        overflowY: "auto",
      }}>
        <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Panel label */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <BarChart3 size={13} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
              Visão do mês
            </span>
          </div>

          {/* ── Progress card ── */}
          {!loading && data && data.summary.total > 0 && (
            <div style={{
              padding: "14px 15px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}>
              {/* Big number */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5, marginBottom: 11 }}>
                <span style={{
                  fontSize: 34, fontWeight: 800, letterSpacing: "-0.05em",
                  lineHeight: 1, color: progressColor,
                }}>
                  {data.summary.done}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500, paddingBottom: 3 }}>
                  / {data.summary.total}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{
                height: 6, borderRadius: 4,
                background: "var(--bg-elevated)",
                overflow: "hidden", marginBottom: 9,
              }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${pct}%`, background: progressColor,
                  transition: "width 600ms cubic-bezier(.4,0,.2,1)",
                }} />
              </div>

              {/* Footer row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: progressColor }}>
                  {pct}% concluído
                </span>
                {data.summary.overdue > 0 ? (
                  <span style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 10, fontWeight: 600, color: "#DC2626",
                    background: "rgba(220,38,38,0.07)",
                    border: "1px solid rgba(220,38,38,0.14)",
                    padding: "2px 7px", borderRadius: 20,
                  }}>
                    <AlertTriangle size={9} /> {data.summary.overdue} atraso
                  </span>
                ) : pct >= 100 ? (
                  <span style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 10, fontWeight: 600, color: "#16A34A",
                    background: "rgba(22,163,74,0.08)",
                    border: "1px solid rgba(22,163,74,0.18)",
                    padding: "2px 7px", borderRadius: 20,
                  }}>
                    <CheckCircle2 size={9} /> Completo
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* ── Por tipo ── */}
          {!loading && data && data.groups.length > 0 && (
            <div>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--text-muted)",
                marginBottom: 12,
              }}>
                Por tipo
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {data.groups.map(group => {
                  const typePct = group.planned > 0
                    ? Math.round((group.done / group.planned) * 100)
                    : group.total > 0 ? Math.round((group.done / group.total) * 100) : 0;
                  const allDone  = group.done >= (group.planned || group.total);
                  const typeColor = allDone ? "#16A34A" : group.overdue > 0 ? "#DC2626" : dot(group.type);

                  return (
                    <div key={group.type}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: "50%",
                            background: dot(group.type), flexShrink: 0,
                          }} />
                          <span style={{
                            fontSize: 12, fontWeight: 500,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {group.type}
                          </span>
                        </div>
                        <span style={{
                          fontSize: 11, color: "var(--text-muted)",
                          flexShrink: 0, marginLeft: 8,
                        }}>
                          {group.done}/{group.planned || group.total}
                        </span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          width: `${Math.min(100, typePct)}%`,
                          background: typeColor,
                          transition: "width 400ms ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Divider */}
          {!loading && <div style={{ height: 1, background: "var(--border)" }} />}

          {/* ── Ações ── */}
          <div>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-muted)",
              marginBottom: 10,
            }}>
              Ações rápidas
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data?.summary.hasPlan && (
                <ActionBtn onClick={handleGenerate} disabled={renewing || restarting || resetting} icon={renewing ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={12} />}>
                  {renewing ? "Gerando…" : "Gerar entregas"}
                </ActionBtn>
              )}
              {data?.summary.hasPlan && (
                <ActionBtn onClick={handleRestart} disabled={restarting || renewing || resetting} icon={restarting ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RotateCcw size={12} />}>
                  {restarting ? "Reiniciando…" : "Reiniciar mês"}
                </ActionBtn>
              )}
              <ActionBtn onClick={() => setWizardOpen(true)} icon={<Plus size={12} />}>
                Trocar plano
              </ActionBtn>
              <ActionBtn
                onClick={handleReset}
                disabled={resetting || renewing || restarting}
                icon={resetting ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />}
                danger
              >
                {resetting ? "Resetando…" : "Resetar cliente"}
              </ActionBtn>
            </div>
          </div>

        </div>
      </aside>

      <ApplyPlanWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        clientId={clientId}
        clientName={clientName}
        onSuccess={() => { setWizardOpen(false); load(); }}
      />
    </div>
  );
}

// ── Group section ──────────────────────────────────────────────────────────────

function GroupSection({
  group, togglingId, onToggle, isFirst, isLast,
}: {
  group: DeliverableGroup;
  togglingId: string | null;
  onToggle: (task: Task) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(true);
  const allDone = group.done >= (group.planned || group.total);
  const color   = dot(group.type);
  const pct     = group.planned > 0
    ? Math.round((group.done / group.planned) * 100)
    : group.total > 0 ? Math.round((group.done / group.total) * 100) : 0;

  const borderRadius = isFirst && isLast ? 12
    : isFirst ? "12px 12px 0 0"
    : isLast  ? "0 0 12px 12px"
    : 0;

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius,
      background: "var(--bg-surface)",
      overflow: "hidden",
      marginTop: isFirst ? 0 : -1,
    }}>
      {/* Group header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", border: "none", cursor: "pointer",
          background: "transparent",
          padding: "11px 18px",
          display: "flex", alignItems: "center", gap: 12,
          textAlign: "left",
        }}
      >
        {/* Dot + label */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{
            fontSize: 12.5, fontWeight: 650, color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}>
            {group.type}
          </span>
        </span>

        {/* Thin progress track */}
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: `${Math.min(100, pct)}%`,
            background: allDone ? "#16A34A" : group.overdue > 0 ? "#DC2626" : color,
            transition: "width 400ms ease",
          }} />
        </div>

        {/* Count + status + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 500 }}>
            {group.done}/{group.planned || group.total}
          </span>
          {allDone && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: "#16A34A",
              background: "rgba(22,163,74,0.1)", padding: "1px 7px", borderRadius: 20,
            }}>
              ✓
            </span>
          )}
          {group.overdue > 0 && !allDone && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: "#DC2626",
              background: "rgba(220,38,38,0.07)", padding: "1px 7px", borderRadius: 20,
            }}>
              {group.overdue}↑
            </span>
          )}
          <span style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1 }}>
            {open ? "▴" : "▾"}
          </span>
        </div>
      </button>

      {/* Task rows */}
      {open && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {group.tasks.map((task, idx) => (
            <TaskRow
              key={task.id}
              task={task}
              isLast={idx === group.tasks.length - 1}
              toggling={togglingId === task.id}
              onToggle={() => onToggle(task)}
              dotColor={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Task row ───────────────────────────────────────────────────────────────────

function TaskRow({ task, isLast, toggling, onToggle, dotColor }: {
  task: Task;
  isLast: boolean;
  toggling: boolean;
  onToggle: () => void;
  dotColor: string;
}) {
  const [hover, setHover] = useState(false);
  const done    = task.status === "DONE";
  const overdue = isOverdue(task);
  const clDone  = task.checklists.filter(c => c.done).length;
  const clTotal = task.checklists.length;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 13,
        padding: "9px 18px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        background: hover && !done ? "var(--bg-hover)" : "transparent",
        transition: "background 100ms",
      }}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        disabled={toggling}
        style={{
          flexShrink: 0,
          width: 17, height: 17,
          borderRadius: 5,
          border: `1.5px solid ${done ? dotColor : overdue ? "#DC2626" : hover ? dotColor : "var(--border-strong)"}`,
          background: done ? dotColor : "transparent",
          cursor: toggling ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 120ms, background 120ms",
          padding: 0, outline: "none",
        }}
      >
        {toggling ? (
          <Loader2 size={9} color={done ? "#fff" : "var(--text-muted)"} style={{ animation: "spin 0.7s linear infinite" }} />
        ) : done ? (
          <svg width={9} height={9} viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5 3.5-5" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      {/* Title */}
      <span style={{
        flex: 1, fontSize: 13, fontWeight: 500,
        color: done ? "var(--text-muted)" : "var(--text-primary)",
        textDecoration: done ? "line-through" : "none",
        textDecorationColor: "var(--border-strong)",
        opacity: done ? 0.5 : 1,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        transition: "opacity 200ms",
      }}>
        {task.title}
      </span>

      {/* Right metadata */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>

        {/* Checklist dots */}
        {clTotal > 0 && !done && (
          <div style={{ display: "flex", gap: 2.5, alignItems: "center" }}>
            {Array.from({ length: clTotal }).map((_, i) => (
              <span key={i} style={{
                width: 5, height: 5, borderRadius: "50%",
                background: i < clDone ? dotColor : "var(--bg-elevated)",
                border: `1px solid ${i < clDone ? dotColor : "var(--border)"}`,
              }} />
            ))}
          </div>
        )}

        {/* Priority */}
        {task.priority === "CRITICAL" && !done && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.08)", padding: "1px 6px", borderRadius: 20, letterSpacing: "0.04em" }}>
            CRÍTICA
          </span>
        )}
        {task.priority === "HIGH" && !done && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#B45309", background: "rgba(245,158,11,0.08)", padding: "1px 6px", borderRadius: 20, letterSpacing: "0.04em" }}>
            ALTA
          </span>
        )}

        {/* Blocker */}
        {task.blocker && !done && (
          <span title={task.blocker} style={{ display: "flex" }}>
            <AlertTriangle size={11} color="#D97706" />
          </span>
        )}

        {/* Date */}
        <span style={{
          fontSize: 11, fontWeight: overdue && !done ? 600 : 400,
          color: done ? "var(--text-muted)" : overdue ? "#DC2626" : "var(--text-muted)",
          opacity: done ? 0.45 : 1,
        }}>
          {fmtDate(task.dueDate)}
        </span>

        {/* Assignee avatar */}
        {task.assignee && (
          <span title={task.assignee.name} style={{
            width: 20, height: 20, borderRadius: "50%",
            background: "var(--accent-soft)", color: "var(--accent)",
            fontSize: 8, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {task.assignee.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ title, sub, cta, onCta, ctaDisabled }: {
  title: string; sub: string; cta: string; onCta: () => void; ctaDisabled?: boolean;
}) {
  return (
    <div style={{
      border: "1.5px dashed var(--border)", borderRadius: 14,
      padding: "52px 32px", textAlign: "center",
    }}>
      <p style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)", marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 22 }}>{sub}</p>
      <button
        onClick={onCta}
        disabled={ctaDisabled}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "var(--accent)", color: "#fff", border: "none",
          borderRadius: 9, padding: "10px 22px", fontSize: 13, fontWeight: 600,
          cursor: ctaDisabled ? "default" : "pointer",
          opacity: ctaDisabled ? 0.6 : 1,
        }}
      >
        {cta}
      </button>
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────────────────────

function ActionBtn({ children, onClick, disabled, icon, danger }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        width: "100%",
        padding: "9px 12px",
        border: `1px solid ${danger ? "var(--red-soft, #fee2e2)" : "var(--border)"}`,
        borderRadius: 9,
        background: danger ? "var(--red-soft, #fff1f2)" : "var(--bg-surface)",
        color: danger ? "var(--red, #DC2626)" : "var(--text-secondary)",
        fontSize: 12, fontWeight: 500, textAlign: "left",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "opacity 150ms, background 150ms",
      }}
    >
      {icon}{children}
    </button>
  );
}

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "var(--text-muted)", padding: 0,
  flexShrink: 0,
};
