"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, CheckSquare, Square } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Task } from "./kanban-content";

const TASK_TYPES = ["Post Feed", "Story", "Campanha", "Criativo", "Reels", "Copy", "Relatório", "Outro"];

interface TaskModalProps {
  clientId: string;
  task?: Task;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ChecklistItem {
  id?: string;
  text: string;
  done: boolean;
  order: number;
  isNew?: boolean;
}

interface User {
  id: string;
  name: string;
}

export function TaskModal({ clientId, task, open, onClose, onSuccess }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [type, setType] = useState(task?.type ?? "");
  const [assignedTo, setAssignedTo] = useState(task?.assignedTo ?? "");
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  );
  const [checklists, setChecklists] = useState<ChecklistItem[]>(task?.checklists ?? []);
  const [newCheckText, setNewCheckText] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers).catch(() => {});
  }, []);

  async function toggleChecklist(item: ChecklistItem, idx: number) {
    if (item.id && task?.id) {
      await fetch(`/api/tasks/${task.id}/checklist/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !item.done }),
      });
    }
    setChecklists((prev) => prev.map((c, i) => i === idx ? { ...c, done: !c.done } : c));
  }

  function addChecklist() {
    if (!newCheckText.trim()) return;
    setChecklists((prev) => [
      ...prev,
      { text: newCheckText.trim(), done: false, order: prev.length, isNew: true },
    ]);
    setNewCheckText("");
  }

  async function deleteChecklist(item: ChecklistItem, idx: number) {
    if (item.id && task?.id) {
      await fetch(`/api/tasks/${task.id}/checklist/${item.id}`, { method: "DELETE" });
    }
    setChecklists((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dueDate) { setError("Data de entrega é obrigatória"); return; }
    setError("");
    setLoading(true);

    const newItems = checklists.filter((c) => c.isNew);

    if (task?.id) {
      // Update existing
      await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, type: type || null, assignedTo: assignedTo || null, dueDate }),
      });

      // Add new checklist items
      for (const item of newItems) {
        await fetch(`/api/tasks/${task.id}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: item.text, order: item.order }),
        });
      }
    } else {
      // Create new
      const res = await fetch(`/api/clients/${clientId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          type: type || null,
          assignedTo: assignedTo || null,
          dueDate,
          checklists: checklists.map((c, i) => ({ text: c.text, order: i })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao criar tarefa");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onSuccess();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? "Editar Tarefa" : "Nova Tarefa"}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={loading} onClick={handleSubmit}>
            {task ? "Salvar" : "Criar Tarefa"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Título *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título da tarefa"
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Selecionar tipo</option>
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>

          <Input
            label="Data de entrega *"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>

        <Select
          label="Responsável"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        >
          <option value="">Sem responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>

        <Textarea
          label="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalhes da tarefa..."
        />

        {/* Checklist */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
            Checklist
          </label>
          <div className="flex flex-col gap-1 mb-2">
            {checklists.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 group/check p-1.5 rounded-lg hover:bg-[var(--bg-hover)]">
                <button type="button" onClick={() => toggleChecklist(item, idx)} className="flex-shrink-0">
                  {item.done
                    ? <CheckSquare size={13} style={{ color: "var(--accent-green)" }} />
                    : <Square size={13} style={{ color: "var(--text-muted)" }} />
                  }
                </button>
                <span
                  className="flex-1 text-xs"
                  style={{
                    color: item.done ? "var(--text-muted)" : "var(--text-secondary)",
                    textDecoration: item.done ? "line-through" : "none",
                  }}
                >
                  {item.text}
                </span>
                <button
                  type="button"
                  onClick={() => deleteChecklist(item, idx)}
                  className="opacity-0 group-hover/check:opacity-100 transition-opacity"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newCheckText}
              onChange={(e) => setNewCheckText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklist(); } }}
              placeholder="Adicionar item..."
              className="flex-1 px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:border-blue-500"
              style={{ background: "var(--bg-base)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
            />
            <Button type="button" variant="ghost" size="sm" onClick={addChecklist}>
              <Plus size={11} />
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--accent-red)", background: "rgba(239,68,68,0.1)" }}>
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
