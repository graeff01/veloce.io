"use client";

import { AlertTriangle, CheckSquare, CirclePause, MoreHorizontal, Pencil, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { formatDate, isOverdue } from "@/lib/utils";
import type { Task } from "./kanban-content";

interface TaskCardProps {
  task: Task;
  onEdit: () => void;
  onDelete?: () => void;
  dragging?: boolean;
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

const priorityConfig: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "Critica", color: "var(--red)" },
  HIGH: { label: "Alta", color: "var(--amber)" },
  NORMAL: { label: "Normal", color: "var(--text-muted)" },
  LOW: { label: "Baixa", color: "var(--text-muted)" },
};

export function TaskCard({ task, onEdit, onDelete, dragging }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const overdue = isOverdue(task.dueDate) && task.status !== "DONE";
  const doneChecks = task.checklists.filter((c) => c.done).length;
  const totalChecks = task.checklists.length;
  const typeCfg = typeConfig[task.type ?? ""] ?? { bg: "var(--bg-elevated)", color: "var(--text-muted)" };
  const priorityCfg = priorityConfig[task.priority ?? "NORMAL"];
  const signalColor = task.priority === "CRITICAL"
    ? "var(--red)"
    : overdue ? "var(--red)" : statusBorderColor[task.status] ?? "var(--border-strong)";
  const operationalMeta = [
    task.type,
    overdue ? "Atrasada" : task.dueDate ? formatDate(task.dueDate) : null,
    totalChecks > 0 ? `${doneChecks}/${totalChecks}` : null,
  ].filter(Boolean).join(" / ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        padding: "9px 10px",
        border: `1px solid ${hovered || dragging ? "var(--border-strong)" : "var(--border)"}`,
        background: hovered || dragging
          ? "linear-gradient(180deg, var(--bg-card), rgba(17,24,39,0.82))"
          : "linear-gradient(180deg, rgba(255,255,255,0.040), rgba(255,255,255,0.018))",
        borderRadius: 12,
        cursor: "pointer",
        position: "relative",
        transition: dragging ? "none" : "background var(--motion-hover) var(--ease-enter), border-color var(--motion-hover) var(--ease-enter), box-shadow var(--motion-hover) var(--ease-enter), transform var(--motion-hover) var(--ease-enter), opacity var(--motion-hover) var(--ease-enter)",
        marginBottom: 0,
        minHeight: 66,
        boxShadow: dragging
          ? "0 14px 34px rgba(0,0,0,0.30), 0 0 0 1px var(--border-strong)"
          : hovered
            ? `0 10px 28px rgba(0,0,0,0.22), 0 0 0 1px ${signalColor}16`
            : "0 1px 2px rgba(0,0,0,0.16)",
        transform: dragging ? "translateY(0)" : hovered ? "translateY(-1px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onEdit}
    >
      <span
        style={{
          width: 3,
          alignSelf: "stretch",
          minHeight: 40,
          borderRadius: "var(--radius-pill)",
          background: signalColor,
          opacity: hovered || dragging ? 1 : 0.68,
          boxShadow: hovered || dragging ? `0 0 18px ${signalColor}44` : "none",
          transition: dragging ? "none" : "opacity var(--motion-hover) var(--ease-enter), box-shadow var(--motion-hover) var(--ease-enter)",
        }}
      />

      {/* Task title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, color: overdue ? "var(--red)" : "var(--text-muted)", lineHeight: "14px", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {operationalMeta || "Tarefa operacional"}
        </p>
        <p
          style={{
            fontSize: 12,
            fontWeight: 620,
            color: hovered ? "var(--text-primary)" : "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: "16px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            whiteSpace: "normal",
          }}
        >
          {task.title}
        </p>

        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
          {task.assignee && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--text-muted)", lineHeight: "15px" }}>
              <UserRound size={9} />
              {task.assignee.name.split(" ")[0]}
            </span>
          )}
          {/* Type badge — small pill */}
          {task.type && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                background: hovered ? typeCfg.bg : "transparent",
                color: typeCfg.color,
                padding: "1px 6px",
                borderRadius: "var(--radius-pill)",
                flexShrink: 0,
                lineHeight: "15px",
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
            task.dueDate && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                {formatDate(task.dueDate)}
              </span>
            )
          )}

          {/* Checklist indicator */}
          {totalChecks > 0 && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                flexShrink: 0,
              }}
            >
              <CheckSquare
                size={10}
                style={{ color: doneChecks === totalChecks ? "var(--green)" : "var(--text-muted)" }}
              />
              {doneChecks}/{totalChecks}
            </span>
          )}

          {task.priority && task.priority !== "NORMAL" && (
            <span style={{ fontSize: 10, color: priorityCfg.color, fontWeight: 650, lineHeight: "15px" }}>
              {priorityCfg.label}
            </span>
          )}

          {task.blocker && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                padding: "1px 6px",
                borderRadius: "var(--radius-pill)",
                lineHeight: "15px",
              }}
            >
              <CirclePause size={9} style={{ color: "var(--amber)" }} />
              {task.blocker}
            </span>
          )}
        </div>
      </div>

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
              borderRadius: "var(--radius-button)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              opacity: hovered || menuOpen ? 1 : 0,
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
                    transition: "background 150ms ease-out",
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
                    transition: "background 150ms ease-out",
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
