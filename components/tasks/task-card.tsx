"use client";

import { AlertTriangle, CheckSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, isOverdue } from "@/lib/utils";
import type { Task } from "./kanban-content";

interface TaskCardProps {
  task: Task;
  onEdit: () => void;
  onDelete?: () => void;
}

const typeConfig: Record<string, { bg: string; color: string }> = {
  "Post Feed": { bg: "var(--blue-soft)",   color: "var(--blue)" },
  "Story":     { bg: "var(--accent-soft)", color: "var(--accent)" },
  "Campanha":  { bg: "var(--amber-soft)",  color: "var(--amber)" },
  "Criativo":  { bg: "var(--green-soft)",  color: "var(--green)" },
  "Reels":     { bg: "#FFF3E0",            color: "#F97316" },
  "Copy":      { bg: "var(--blue-soft)",   color: "var(--blue)" },
  "Relatório": { bg: "var(--bg-elevated)", color: "var(--text-secondary)" },
  "Outro":     { bg: "var(--bg-elevated)", color: "var(--text-secondary)" },
};

const statusBorderColor: Record<string, string> = {
  TODO:        "var(--blue)",
  IN_PROGRESS: "var(--amber)",
  REVIEW:      "var(--accent)",
  DONE:        "var(--green)",
};

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const overdue = isOverdue(task.dueDate) && task.status !== "DONE";
  const doneChecks = task.checklists.filter((c) => c.done).length;
  const totalChecks = task.checklists.length;
  const typeCfg = typeConfig[task.type ?? ""] ?? { bg: "var(--bg-elevated)", color: "var(--text-muted)" };
  const leftBorderColor = overdue ? "var(--red)" : statusBorderColor[task.status] ?? "var(--border-strong)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderLeft: `3px solid ${hovered ? "var(--accent)" : leftBorderColor}`,
        background: hovered ? "var(--bg-elevated)" : "transparent",
        borderRadius: "0 6px 6px 0",
        cursor: "pointer",
        position: "relative",
        transition: "background 150ms ease-out, border-color 150ms ease-out",
        marginBottom: 2,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onEdit}
    >
      {/* Task title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: "18px",
          }}
        >
          {task.title}
        </p>

        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          {/* Type badge */}
          {task.type && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                background: typeCfg.bg,
                color: typeCfg.color,
                padding: "1px 6px",
                borderRadius: 20,
                flexShrink: 0,
              }}
            >
              {task.type}
            </span>
          )}

          {/* Due date */}
          {overdue ? (
            <span
              style={{
                fontSize: 11,
                color: "var(--red)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={9} />
              {formatDate(task.dueDate)}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              {formatDate(task.dueDate)}
            </span>
          )}

          {/* Checklist indicator */}
          {totalChecks > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
              <CheckSquare
                size={10}
                color={doneChecks === totalChecks ? "var(--green)" : "var(--text-muted)"}
              />
              {doneChecks}/{totalChecks}
            </span>
          )}
        </div>
      </div>

      {/* Assignee avatar */}
      {task.assignee && (
        <Avatar name={task.assignee.name} size="xs" />
      )}

      {/* More menu */}
      {onDelete && (
        <div
          style={{ flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              opacity: hovered ? 1 : 0,
              transition: "opacity 150ms ease-out",
            }}
          >
            <MoreHorizontal size={12} />
          </button>

          {menuOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 28,
                  zIndex: 50,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 8,
                  padding: "4px 0",
                  minWidth: 120,
                  boxShadow: "var(--shadow-hover)",
                }}
              >
                <button
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background = "none")
                  }
                  onClick={() => { setMenuOpen(false); onEdit(); }}
                >
                  <Pencil size={10} /> Editar
                </button>
                <button
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    color: "var(--red)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background = "var(--red-soft)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background = "none")
                  }
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                >
                  <Trash2 size={10} /> Excluir
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
