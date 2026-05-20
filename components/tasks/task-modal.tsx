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
  presentation?: "modal" | "drawer";
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

const TASK_PRIORITIES = [
  { value: "CRITICAL", label: "Critica" },
  { value: "HIGH", label: "Alta" },
  { value: "NORMAL", label: "Normal" },
  { value: "LOW", label: "Baixa" },
] as const;
const BLOCKERS = ["", "Aguardando cliente", "Aguardando criativo", "Aguardando aprovacao"];
const SMART_TEMPLATES = [
  {
    label: "Campanha imobiliaria",
    title: "Campanha imobiliaria",
    type: "Campanha",
    checklists: ["Briefing e oferta", "Criativo aprovado", "Copy revisada", "Campanha configurada", "Publicar e monitorar"],
  },
  {
    label: "Lancamento",
    title: "Lancamento",
    type: "Campanha",
    checklists: ["Mensagem principal", "Sequencia de criativos", "Pagina ou destino validado", "Aprovacao final", "Go live"],
  },
  {
    label: "Sequencia de conteudo",
    title: "Sequencia de conteudo",
    type: "Post Feed",
    checklists: ["Pautas definidas", "Copies aprovadas", "Criativos prontos", "Agendamento", "Revisao pos-publicacao"],
  },
];

export function TaskModal({ clientId, task, open, onClose, onSuccess, presentation = "modal" }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [type, setType] = useState(task?.type ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "NORMAL");
  const [blocker, setBlocker] = useState(task?.blocker ?? "");
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

  function applyTemplate(template: typeof SMART_TEMPLATES[number]) {
    setTitle((current) => current || template.title);
    setType(template.type);
    setChecklists(template.checklists.map((text, order) => ({ text, done: false, order, isNew: true })));
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
        body: JSON.stringify({ title, description, type: type || null, priority, blocker: blocker || null, assignedTo: assignedTo || null, dueDate }),
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
          priority,
          blocker: blocker || null,
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
      size={presentation === "drawer" ? "lg" : "md"}
      variant={presentation === "drawer" ? "drawer" : "center"}
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
        {task && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              padding: 10,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--bg-base)",
            }}
          >
            <TaskContext label="Status" value={statusLabel(task.status)} />
            <TaskContext label="Prioridade" value={priorityLabel(priority)} />
            <TaskContext label="Bloqueio" value={blocker || "Sem bloqueio"} />
            <TaskContext label="Checklist" value={`${checklists.filter((item) => item.done).length}/${checklists.length}`} />
            <TaskContext label="Entrega" value={dueDate || "Sem prazo"} />
            <TaskContext label="Fluxo" value="Painel lateral" />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SMART_TEMPLATES.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => applyTemplate(template)}
              style={{
                height: 30,
                border: "1px solid var(--border)",
                borderRadius: 7,
                background: "var(--bg-base)",
                color: "var(--text-secondary)",
                padding: "0 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {template.label}
            </button>
          ))}
        </div>
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

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Prioridade"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {TASK_PRIORITIES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </Select>

          <Select
            label="Bloqueio"
            value={blocker}
            onChange={(e) => setBlocker(e.target.value)}
          >
            {BLOCKERS.map((item) => (
              <option key={item} value={item}>{item || "Sem bloqueio"}</option>
            ))}
          </Select>
        </div>

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

function TaskContext({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {label}
      </p>
      <p style={{ marginTop: 3, fontSize: 12, fontWeight: 620, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </p>
    </div>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    TODO: "A fazer",
    IN_PROGRESS: "Em andamento",
    REVIEW: "Revisao",
    DONE: "Concluido",
  };
  return labels[status] ?? status;
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    CRITICAL: "Critica",
    HIGH: "Alta",
    NORMAL: "Normal",
    LOW: "Baixa",
  };
  return labels[priority] ?? priority;
}
