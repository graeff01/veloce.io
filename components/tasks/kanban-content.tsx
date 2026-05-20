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

export interface Task {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  type?: string;
  status: TaskStatus;
  assignedTo?: string;
  dueDate: string;
  order: number;
  assignee?: { id: string; name: string } | null;
  checklists: Array<{ id: string; text: string; done: boolean; order: number }>;
}

const COLUMNS: { id: TaskStatus; label: string; color: string; softColor: string }[] = [
  { id: "TODO",        label: "A Fazer",      color: "var(--blue)",   softColor: "var(--blue-soft)" },
  { id: "IN_PROGRESS", label: "Em Andamento", color: "var(--amber)",  softColor: "var(--amber-soft)" },
  { id: "REVIEW",      label: "Revisão",      color: "var(--accent)", softColor: "var(--accent-soft)" },
  { id: "DONE",        label: "Concluído",    color: "var(--green)",  softColor: "var(--green-soft)" },
];

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
    )
      return;

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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
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
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-muted)")}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              Kanban {clientName ? `— ${clientName}` : ""}
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {tasks.length} tarefas
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Month/year selectors */}
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(parseInt(e.target.value))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
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
                padding: "6px 10px",
                borderRadius: 8,
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

      {/* Kanban board */}
      <div style={{ flex: 1, overflowX: "auto", padding: "20px 24px" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 16 }}>
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                style={{
                  flexShrink: 0,
                  width: 300,
                  height: 200,
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
                gap: 16,
                minHeight: "calc(100vh - 160px)",
                alignItems: "flex-start",
              }}
            >
              {COLUMNS.map((col) => {
                const colTasks = tasks.filter((t) => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    style={{
                      flexShrink: 0,
                      width: 300,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* Column header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                        padding: "0 4px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: col.color,
                          background: col.softColor,
                          padding: "3px 10px",
                          borderRadius: 20,
                        }}
                      >
                        {col.label}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-muted)",
                          background: "var(--bg-elevated)",
                          padding: "2px 8px",
                          borderRadius: 20,
                        }}
                      >
                        {colTasks.length}
                      </span>
                    </div>

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
                              : "var(--bg-surface)",
                            border: `1px solid ${snapshot.isDraggingOver ? col.color + "40" : "var(--border)"}`,
                            borderRadius: 10,
                            padding: "8px 4px",
                            minHeight: 80,
                            transition: "background 150ms ease-out, border-color 150ms ease-out",
                          }}
                        >
                          {colTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{
                                    ...provided.draggableProps.style,
                                    opacity: snapshot.isDragging ? 0.8 : 1,
                                  }}
                                >
                                  <TaskCard
                                    task={task}
                                    onEdit={() => setEditTask(task)}
                                    onDelete={isAdmin ? () => handleDeleteTask(task.id) : undefined}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}

                          {colTasks.length === 0 && !snapshot.isDraggingOver && (
                            <div
                              style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                color: "var(--text-muted)",
                                minHeight: 60,
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

      {/* New task modal */}
      {newTaskModal && (
        <TaskModal
          clientId={clientId}
          open={newTaskModal}
          onClose={() => setNewTaskModal(false)}
          onSuccess={() => { setNewTaskModal(false); loadTasks(); }}
        />
      )}

      {/* Edit task modal */}
      {editTask && (
        <TaskModal
          clientId={clientId}
          task={editTask}
          open={!!editTask}
          onClose={() => setEditTask(null)}
          onSuccess={() => { setEditTask(null); loadTasks(); }}
        />
      )}
    </div>
  );
}
