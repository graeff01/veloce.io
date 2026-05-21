"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { Badge, TaskStatusBadge } from "@/components/ui/badge";
import { formatDate, isOverdue } from "@/lib/utils";
import type { TaskStatus } from "@/components/tasks/kanban-content";

interface Task {
  id: string;
  title: string;
  type?: string;
  status: TaskStatus;
  dueDate: string;
  assignee?: { name: string } | null;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const statusColors: Record<TaskStatus, string> = {
  TODO:        "var(--accent-blue)",
  IN_PROGRESS: "var(--accent-amber)",
  REVIEW:      "var(--accent-purple)",
  DONE:        "var(--accent-green)",
};

export function CalendarContent({ clientId }: { clientId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([
      fetch(`/api/clients/${clientId}/tasks?month=${month}&year=${year}`).then((r) => r.json()),
      fetch(`/api/clients/${clientId}`).then((r) => r.json()),
    ]).then(([tasksData, clientData]) => {
      setTasks(tasksData);
      setClientName(clientData.name);
      setLoading(false);
    });
  }, [clientId, month, year]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setSelectedDay(null);
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;

  // Group tasks by day
  const tasksByDay: Record<number, Task[]> = {};
  for (const task of tasks) {
    const d = new Date(task.dueDate);
    const day = d.getDate();
    if (!tasksByDay[day]) tasksByDay[day] = [];
    tasksByDay[day].push(task);
  }

  const selectedTasks = selectedDay ? (tasksByDay[selectedDay] ?? []) : [];

  // Build calendar grid (6 rows × 7 cols)
  const cells: (number | null)[] = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDay + 1;
    return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
  });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Calendar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <Link href={`/clients/${clientId}`} className="hover:opacity-70 transition-opacity">
              <ArrowLeft size={15} style={{ color: "var(--text-muted)" }} />
            </Link>
            <div>
              <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                Calendário — {clientName}
              </h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {tasks.length} tarefas em {MONTHS[month - 1]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-medium min-w-[120px] text-center" style={{ color: "var(--text-primary)" }}>
              {MONTHS[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 px-4 pt-3 pb-1">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-center">
              <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
                {wd}
              </span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 grid grid-cols-7 grid-rows-6 px-4 pb-4 gap-1 overflow-hidden">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;

            const dayTasks = tasksByDay[day] ?? [];
            const isToday = isCurrentMonth && today.getDate() === day;
            const isSelected = selectedDay === day;
            const isOverloaded = dayTasks.length >= 3;
            const hasOverdue = dayTasks.some((t) => isOverdue(t.dueDate) && t.status !== "DONE");

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className="rounded-lg p-1.5 text-left transition-all border flex flex-col hover:border-[var(--border-strong)]"
                style={{
                  background: isSelected
                    ? "rgba(59,130,246,0.12)"
                    : isToday
                    ? "rgba(59,130,246,0.06)"
                    : "var(--bg-surface)",
                  borderColor: isSelected
                    ? "var(--accent-blue)"
                    : isToday
                    ? "rgba(59,130,246,0.3)"
                    : isOverloaded
                    ? "rgba(249,115,22,0.3)"
                    : "var(--border)",
                }}
              >
                <span
                  className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-1 ${isToday ? "text-white" : ""}`}
                  style={{
                    color: isToday ? "white" : "var(--text-secondary)",
                    background: isToday ? "var(--accent-blue)" : "transparent",
                    fontSize: "11px",
                  }}
                >
                  {day}
                </span>

                <div className="flex flex-wrap gap-0.5">
                  {dayTasks.slice(0, 4).map((task) => (
                    <div
                      key={task.id}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: isOverdue(task.dueDate) && task.status !== "DONE" ? "var(--accent-red)" : statusColors[task.status] }}
                      title={task.title}
                    />
                  ))}
                  {dayTasks.length > 4 && (
                    <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>+{dayTasks.length - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Side panel */}
      <div
        className="w-72 border-l flex-shrink-0 flex flex-col overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      >
        {selectedDay ? (
          <>
            <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {selectedDay} de {MONTHS[month - 1]}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {selectedTasks.length} tarefa{selectedTasks.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {selectedTasks.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Dia sem entregas programadas</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {selectedTasks.map((task) => (
                    <DayTaskRow key={task.id} task={task} clientId={clientId} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--bg-elevated)" }}>
              <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
            </div>
            <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Selecione um dia
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Clique em qualquer dia para ver as tarefas
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Legenda</p>
          <div className="flex flex-col gap-1.5">
            {(Object.entries(statusColors) as [TaskStatus, string][]).map(([status, color]) => {
              const labels: Record<TaskStatus, string> = {
                TODO: "A Fazer", IN_PROGRESS: "Em Andamento", REVIEW: "Revisão", DONE: "Concluído"
              };
              return (
                <div key={status} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{labels[status]}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--accent-red)" }} />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Em atraso</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayTaskRow({ task, clientId }: { task: Task; clientId: string }) {
  const overdue = isOverdue(task.dueDate) && task.status !== "DONE";
  return (
    <Link href={`/clients/${clientId}/tasks`}>
      <div
        className="rounded-lg p-3 border hover:border-[var(--border-strong)] transition-colors cursor-pointer"
        style={{
          background: "var(--bg-elevated)",
          borderColor: overdue ? "rgba(239,68,68,0.3)" : "var(--border)",
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-xs font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {task.title}
          </p>
          <TaskStatusBadge status={task.status} />
        </div>
        <div className="flex items-center gap-2">
          {task.type && <Badge variant="gray">{task.type}</Badge>}
          {overdue && (
            <span className="text-[10px]" style={{ color: "var(--accent-red)" }}>Em atraso</span>
          )}
        </div>
      </div>
    </Link>
  );
}
