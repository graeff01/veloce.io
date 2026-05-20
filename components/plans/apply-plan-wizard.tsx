"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, ChevronRight, ChevronLeft, BookOpen } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Plan {
  id: string;
  name: string;
  description?: string;
  items: Array<{ id: string; type: string; quantity: number }>;
}

interface WizardTask {
  type: string;
  title: string;
  dueDate: string;
  occurrence: number;
}

interface ApplyPlanWizardProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onSuccess: () => void;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function ApplyPlanWizard({ open, onClose, clientId, clientName, onSuccess }: ApplyPlanWizardProps) {
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [tasks, setTasks] = useState<WizardTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdTasks, setCreatedTasks] = useState<{ title: string }[]>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/plans").then((r) => r.json()).then(setPlans);
    }
  }, [open]);

  function handleSelectPlan(plan: Plan) {
    setSelectedPlan(plan);
    // Generate task placeholders
    const generated: WizardTask[] = [];
    for (const item of plan.items) {
      for (let i = 0; i < item.quantity; i++) {
        generated.push({
          type: item.type,
          title: `${item.type} ${i + 1}`,
          dueDate: "",
          occurrence: i + 1,
        });
      }
    }
    setTasks(generated);
  }

  function updateTask(idx: number, field: keyof WizardTask, value: string) {
    setTasks((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }

  async function handleApply() {
    if (tasks.some((t) => !t.dueDate)) {
      alert("Defina a data de todas as tarefas antes de continuar.");
      return;
    }

    setLoading(true);

    const res = await fetch(`/api/clients/${clientId}/apply-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: selectedPlan!.id,
        month,
        year,
        tasks,
      }),
    });

    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setCreatedTasks(data.tasks);
      setSuccess(true);
      setStep(4);
    }
  }

  function handleClose() {
    setStep(1);
    setSelectedPlan(null);
    setTasks([]);
    setSuccess(false);
    setCreatedTasks([]);
    onClose();
  }

  function handleSuccessClose() {
    handleClose();
    onSuccess();
  }

  const now = new Date();
  const yearOptions = [now.getFullYear(), now.getFullYear() + 1];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Aplicar Plano — ${clientName}`}
      size="lg"
      footer={
        step < 4 ? (
          <>
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft size={12} /> Voltar
              </Button>
            )}
            <div className="flex-1" />
            {step === 1 && (
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedPlan}
                onClick={() => setStep(2)}
              >
                Próximo <ChevronRight size={12} />
              </Button>
            )}
            {step === 2 && (
              <Button variant="primary" size="sm" onClick={() => setStep(3)}>
                Definir Datas <ChevronRight size={12} />
              </Button>
            )}
            {step === 3 && (
              <Button
                variant="primary"
                size="sm"
                loading={loading}
                onClick={handleApply}
              >
                Aplicar Plano
              </Button>
            )}
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={handleSuccessClose}>
            Concluído
          </Button>
        )
      }
    >
      {/* Steps indicator */}
      {step < 4 && (
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{
                  background: s <= step ? "var(--accent-blue)" : "var(--bg-elevated)",
                  color: s <= step ? "white" : "var(--text-muted)",
                }}
              >
                {s}
              </div>
              {s < 3 && (
                <div className="h-px w-8" style={{ background: s < step ? "var(--accent-blue)" : "var(--border)" }} />
              )}
            </div>
          ))}
          <div className="ml-3 text-xs" style={{ color: "var(--text-muted)" }}>
            {step === 1 && "Selecionar plano"}
            {step === 2 && "Revisar entregas"}
            {step === 3 && "Definir datas"}
          </div>
        </div>
      )}

      {/* Step 1: Select plan */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 mb-2">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Mês de referência</label>
              <div className="flex gap-2">
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  className="px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                  style={{ background: "var(--bg-base)", borderColor: "var(--border-strong)", color: "var(--text-secondary)" }}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  className="px-2 py-1.5 rounded-lg text-xs border focus:outline-none"
                  style={{ background: "var(--bg-base)", borderColor: "var(--border-strong)", color: "var(--text-secondary)" }}
                >
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Selecionar template</p>
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => handleSelectPlan(plan)}
              className="flex items-start gap-3 p-4 rounded-xl border text-left w-full transition-all"
              style={{
                background: selectedPlan?.id === plan.id ? "rgba(59,130,246,0.08)" : "var(--bg-elevated)",
                borderColor: selectedPlan?.id === plan.id ? "var(--accent-blue)" : "var(--border)",
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.12)" }}>
                <BookOpen size={14} style={{ color: "var(--accent-purple)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>{plan.name}</p>
                {plan.description && (
                  <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{plan.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {plan.items.map((item) => (
                    <Badge key={item.id} variant="gray">{item.type}: {item.quantity}x</Badge>
                  ))}
                </div>
              </div>
              {selectedPlan?.id === plan.id && (
                <CheckCircle2 size={16} style={{ color: "var(--accent-blue)" }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && selectedPlan && (
        <div>
          <div className="rounded-xl border p-4 mb-4" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{selectedPlan.name}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Mês de referência: {MONTHS[month - 1]} / {year}
            </p>
          </div>

          <p className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
            As seguintes tarefas serão geradas ({tasks.length} total):
          </p>

          <div className="flex flex-col gap-2">
            {selectedPlan.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{item.type}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {item.quantity} ocorrência{item.quantity > 1 ? "s" : ""} no mês
                  </p>
                </div>
                <Badge variant="blue">{item.quantity}x</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Set dates */}
      {step === 3 && (
        <div>
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            Defina a data de entrega para cada tarefa. Você pode ajustar depois no Kanban.
          </p>

          <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
            {tasks.map((task, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="gray">{task.type}</Badge>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>#{task.occurrence}</span>
                  </div>
                  <input
                    value={task.title}
                    onChange={(e) => updateTask(idx, "title", e.target.value)}
                    className="w-full text-xs px-2 py-1 rounded border focus:outline-none focus:border-blue-500"
                    style={{ background: "var(--bg-base)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
                  />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: "var(--text-muted)" }}>Data *</label>
                  <input
                    type="date"
                    value={task.dueDate}
                    onChange={(e) => updateTask(idx, "dueDate", e.target.value)}
                    className="px-2 py-1 rounded border text-xs focus:outline-none focus:border-blue-500"
                    style={{
                      background: task.dueDate ? "var(--bg-base)" : "rgba(239,68,68,0.05)",
                      borderColor: task.dueDate ? "var(--border-strong)" : "rgba(239,68,68,0.4)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && success && (
        <div className="flex flex-col items-center text-center py-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(16,185,129,0.12)" }}>
            <CheckCircle2 size={28} style={{ color: "var(--accent-green)" }} />
          </div>
          <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Plano aplicado com sucesso!
          </h3>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {createdTasks.length} tarefas criadas para {clientName}
          </p>
          <div className="w-full max-h-48 overflow-y-auto flex flex-col gap-1.5">
            {createdTasks.map((t, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-left" style={{ background: "var(--bg-elevated)" }}>
                <CheckCircle2 size={12} style={{ color: "var(--accent-green)" }} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
