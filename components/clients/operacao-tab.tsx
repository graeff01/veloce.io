"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, Zap, Plus, Loader2 } from "lucide-react";
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

function dot(type: string) {
  return TYPE_DOT[type] ?? "#6366F1";
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
  const [loading, setLoading]   = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/deliverables?month=${month}&year=${year}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [clientId, month, year]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  async function toggleTask(task: Task) {
    if (togglingId) return;
    setTogglingId(task.id);
    const next = task.status === "DONE" ? "TODO" : "DONE";

    setData(prev => {
      if (!prev) return prev;
      let summaryDelta = next === "DONE" ? 1 : -1;
      return {
        ...prev,
        summary: { ...prev.summary, done: prev.summary.done + summaryDelta },
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
    await fetch(`/api/clients/${clientId}/renew-plan`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    setRenewing(false);
    load();
  }

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const pct = data && data.summary.total > 0
    ? Math.round((data.summary.done / data.summary.total) * 100) : 0;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 760, padding: "28px 32px" }}>

        {/* ── Header ────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={prevMonth} style={navBtn}>
              <ChevronLeft size={15} />
            </button>
            <div style={{ textAlign: "center", minWidth: 156 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                {MONTHS[month - 1]} {year}
              </span>
              {isCurrentMonth && (
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 20 }}>
                  hoje
                </span>
              )}
            </div>
            <button onClick={nextMonth} style={navBtn}>
              <ChevronRight size={15} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {data?.summary.hasPlan && (
              <Btn onClick={handleGenerate} disabled={renewing} icon={<Zap size={12} />}>
                {renewing ? "Gerando…" : "Gerar entregas"}
              </Btn>
            )}
            <Btn onClick={() => setWizardOpen(true)} icon={<Plus size={12} />}>
              Trocar plano
            </Btn>
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────── */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", color: "var(--text-muted)" }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ── No plan ───────────────────────────────────────── */}
        {!loading && data && !data.summary.hasPlan && data.summary.total === 0 && (
          <EmptyState
            title="Nenhum plano ativo"
            sub="Edite o cliente e defina os entregáveis mensais para começar."
            cta="Aplicar plano"
            onCta={() => setWizardOpen(true)}
          />
        )}

        {/* ── Has plan, no tasks ────────────────────────────── */}
        {!loading && data && data.summary.hasPlan && data.summary.total === 0 && (
          <EmptyState
            title={`Sem entregas em ${MONTHS[month - 1]}`}
            sub={`Plano ativo: ${data.summary.planName}`}
            cta={renewing ? "Gerando…" : "Gerar entregas do mês"}
            onCta={handleGenerate}
            ctaDisabled={renewing}
          />
        )}

        {/* ── Content ───────────────────────────────────────── */}
        {!loading && data && data.summary.total > 0 && (
          <>
            {/* Progress summary */}
            <ProgressBar done={data.summary.done} total={data.summary.total} pct={pct} overdue={data.summary.overdue} />

            {/* Groups */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 20 }}>
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
          </>
        )}
      </div>

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

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ done, total, pct, overdue }: { done: number; total: number; pct: number; overdue: number }) {
  const color = pct >= 80 ? "#16A34A" : pct >= 40 ? "#D97706" : overdue > 0 ? "#DC2626" : "var(--accent)";

  return (
    <div style={{
      padding: "16px 20px",
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.04em", lineHeight: 1 }}>{done}</span>
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>/ {total} entregues</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {overdue > 0 && (
            <span style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600, color: "#DC2626",
              background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)",
              padding: "3px 10px", borderRadius: 20,
            }}>
              <AlertTriangle size={10} /> {overdue} em atraso
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 36, textAlign: "right" }}>{pct}%</span>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 4,
          width: `${pct}%`, background: color,
          transition: "width 600ms cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
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
          padding: "12px 20px",
          display: "flex", alignItems: "center", gap: 14,
          textAlign: "left",
        }}
      >
        {/* Dot + label */}
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
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

        {/* Count + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 500 }}>
            {group.done}/{group.planned || group.total}
          </span>
          {allDone && (
            <span style={{ fontSize: 10, fontWeight: 600, color: "#16A34A", background: "rgba(22,163,74,0.1)", padding: "1px 7px", borderRadius: 20 }}>
              ✓
            </span>
          )}
          {group.overdue > 0 && !allDone && (
            <span style={{ fontSize: 10, fontWeight: 600, color: "#DC2626", background: "rgba(220,38,38,0.07)", padding: "1px 7px", borderRadius: 20 }}>
              {group.overdue}↑
            </span>
          )}
          <span style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1 }}>
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
        display: "flex", alignItems: "center", gap: 14,
        padding: "9px 20px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        background: hover && !done ? "rgba(0,0,0,0.015)" : "transparent",
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
          width: 18, height: 18,
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
          <Loader2 size={10} color={done ? "#fff" : "var(--text-muted)"} style={{ animation: "spin 0.7s linear infinite" }} />
        ) : done ? (
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
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
        opacity: done ? 0.55 : 1,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        transition: "opacity 200ms",
      }}>
        {task.title}
      </span>

      {/* Right metadata */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>

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
            <AlertTriangle size={12} color="#D97706" />
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

        {/* Avatar */}
        {task.assignee && (
          <span title={task.assignee.name} style={{
            width: 20, height: 20, borderRadius: "50%",
            background: "var(--accent-soft)", color: "var(--accent)",
            fontSize: 8, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
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

function Btn({ children, onClick, disabled, icon }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        border: "1px solid var(--border)", borderRadius: 8,
        background: "var(--bg-surface)", color: "var(--text-secondary)",
        padding: "6px 13px", fontSize: 12, fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1, transition: "opacity 150ms",
      }}
    >
      {icon}{children}
    </button>
  );
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "var(--text-muted)", padding: 0,
};
