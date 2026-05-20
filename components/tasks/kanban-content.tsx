"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskModal } from "@/components/tasks/task-modal";
import { Button } from "@/components/ui/button";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type TaskPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface Task {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  type?: string;
  status: TaskStatus;
  priority: TaskPriority;
  blocker?: string | null;
  assignedTo?: string;
  dueDate: string;
  order: number;
  assignee?: { id: string; name: string } | null;
  checklists: Array<{ id: string; text: string; done: boolean; order: number }>;
}

const COLUMNS: { id: TaskStatus; label: string; labelShort: string; color: string; softColor: string }[] = [
  { id: "TODO",        label: "A Fazer",      labelShort: "A FAZER",      color: "var(--blue)",   softColor: "var(--blue-soft)" },
  { id: "IN_PROGRESS", label: "Em Andamento", labelShort: "ANDAMENTO",    color: "var(--amber)",  softColor: "var(--amber-soft)" },
  { id: "REVIEW",      label: "Revisão",      labelShort: "REVISÃO",      color: "var(--accent)", softColor: "var(--accent-soft)" },
  { id: "DONE",        label: "Concluído",    labelShort: "CONCLUÍDO",    color: "var(--green)",  softColor: "var(--green-soft)" },
];

const HEADER_HEIGHT = 57; // matches the top-level layout header

export function KanbanContent({ clientId }: { clientId: string }) {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskModal, setNewTaskModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [clientName, setClientName] = useState("");

  async function loadTasks() {
    const res = await fetch(
      `/api/clients/${clientId}/tasks?month=${filterMonth}&year=${filterYear}`
    );
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }

  async function loadClientName() {
    const res = await fetch(`/api/clients/${clientId}`);
    if (res.ok) {
      const data = await res.json();
      setClientName(data.name);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTasks();
    loadClientName();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, filterMonth, filterYear]);

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) return;

    const newStatus = destination.droppableId as TaskStatus;
    setTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t))
    );
    await fetch(`/api/tasks/${draggableId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Tem certeza que deseja remover esta tarefa?")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  const now = new Date();
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2024, i, 1).toLocaleDateString("pt-BR", { month: "long" }),
  }));

  const isAdmin = session?.user.role === "ADMIN";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        overflow: "hidden",
      }}
    >
      {/* ── Kanban header ─────────────────────────────── */}
      <div
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        {/* Back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href={`/clients/${clientId}`}
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              transition: "color 150ms ease-out",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)")
            }
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: "20px",
              }}
            >
              Kanban{clientName ? ` — ${clientName}` : ""}
            </h1>
            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: "15px" }}>
              {tasks.length} tarefa{tasks.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Filters + new task */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(parseInt(e.target.value))}
              style={{
                padding: "5px 10px",
                borderRadius: 7,
                fontSize: 12,
                border: "1px solid var(--border-strong)",
                background: "var(--bg-surface)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(parseInt(e.target.value))}
              style={{
                padding: "5px 10px",
                borderRadius: 7,
                fontSize: 12,
                border: "1px solid var(--border-strong)",
                background: "var(--bg-surface)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <Button variant="primary" size="sm" onClick={() => setNewTaskModal(true)}>
            <Plus size={12} /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* ── Kanban board ──────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "18px 20px",
          background:
            "radial-gradient(circle at 18% 0%, rgba(139,140,255,0.10), transparent 32rem), var(--bg-base)",
        }}
      >
        {loading ? (
          <div style={{ display: "flex", gap: 14 }}>
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                style={{
                  flexShrink: 0,
                  width: 290,
                  height: 240,
                  borderRadius: 10,
                  background: "var(--bg-surface)",
                  animation: "pulse 1.5s infinite",
                }}
              />
            ))}
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div
              style={{
                display: "flex",
                gap: 14,
                height: "100%",
                alignItems: "flex-start",
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 18,
                background: "var(--bg-board)",
                boxShadow: "var(--shadow-card)",
                backdropFilter: "blur(14px)",
                minWidth: "max-content",
              }}
            >
              {COLUMNS.map((col) => {
                const colTasks = tasks.filter((t) => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    style={{
                      flexShrink: 0,
                      width: 286,
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                      padding: 10,
                      borderRadius: 14,
                      background: "var(--bg-column)",
                      border: "1px solid var(--border)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                    }}
                  >
                    {/* Column header chip: "A FAZER · 3" */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 10,
                        padding: "0 2px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          color: col.color,
                          background: col.softColor,
                          padding: "3px 10px",
                          borderRadius: 20,
                        }}
                      >
                        {col.labelShort}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: col.color,
                          opacity: 0.7,
                        }}
                      >
                        · {colTasks.length}
                      </span>
                    </div>

                    {/* Droppable area */}
                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            background: snapshot.isDraggingOver
                              ? col.softColor
                              : "rgba(255,255,255,0.015)",
                            border: `1px solid ${
                              snapshot.isDraggingOver
                                ? col.color + "50"
                                : "var(--border)"
                            }`,
                            borderRadius: 12,
                            padding: "5px",
                            overflowY: "auto",
                            minHeight: 80,
                            transition:
                              "background 150ms ease-out, border-color 150ms ease-out",
                          }}
                        >
                          {colTasks.map((task, index) => (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{
                                    ...provided.draggableProps.style,
                                    opacity: snapshot.isDragging ? 0.85 : 1,
                                  }}
                                >
                                  <TaskCard
                                    task={task}
                                    onEdit={() => setEditTask(task)}
                                    onDelete={
                                      isAdmin
                                        ? () => handleDeleteTask(task.id)
                                        : undefined
                                    }
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}

                          {colTasks.length === 0 &&
                            !snapshot.isDraggingOver && (
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  color: "var(--text-muted)",
                                  minHeight: 60,
                                  opacity: 0.6,
                                }}
                              >
                                Arraste tarefas aqui
                              </div>
                            )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────── */}
      {newTaskModal && (
        <TaskModal
          clientId={clientId}
          open={newTaskModal}
          onClose={() => setNewTaskModal(false)}
          onSuccess={() => { setNewTaskModal(false); loadTasks(); }}
        />
      )}

      {editTask && (
        <TaskModal
          clientId={clientId}
          task={editTask}
          open={!!editTask}
          presentation="drawer"
          onClose={() => setEditTask(null)}
          onSuccess={() => { setEditTask(null); loadTasks(); }}
        />
      )}
    </div>
  );
}
