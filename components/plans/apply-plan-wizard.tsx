"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, BookOpen, RefreshCw, Zap } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DELIVERABLE_DEFAULTS, calcDueDate } from "@/lib/deliverable-defaults";

interface PlanItem {
  id: string;
  type: string;
  quantity: number;
  deadlineDayOfMonth?: number | null;
  defaultPriority?: string;
  checklistItems?: string[];
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  items: PlanItem[];
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
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: "Crítica", HIGH: "Alta", NORMAL: "Normal", LOW: "Baixa",
};

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--red)", HIGH: "var(--amber)", NORMAL: "var(--blue)", LOW: "var(--text-muted)",
};

function previewTasks(plan: Plan, month: number, year: number) {
  const tasks: { type: string; title: string; dueDate: Date; priority: string; checklist: string[] }[] = [];
  for (const item of plan.items) {
    const defs = DELIVERABLE_DEFAULTS[item.type] ?? {};
    const deadline = item.deadlineDayOfMonth ?? defs.deadlineDayOfMonth ?? 15;
    const priority = item.defaultPriority || defs.priority || "NORMAL";
    const checklist = item.checklistItems?.length ? item.checklistItems : defs.checklistItems ?? [];
    for (let i = 1; i <= item.quantity; i++) {
      tasks.push({
        type: item.type,
        title: item.quantity === 1 ? item.type : `${item.type} ${i}`,
        dueDate: calcDueDate(year, month, deadline),
        priority,
        checklist,
      });
    }
  }
  return tasks;
}

export function ApplyPlanWizard({ open, onClose, clientId, clientName, onSuccess }: ApplyPlanWizardProps) {
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [autoRenew, setAutoRenew] = useState(true);
  const [clearExistingTasks, setClearExistingTasks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  useEffect(() => {
    if (open) {
      fetch("/api/plans").then((r) => r.json()).then(setPlans).catch(() => {});
    }
  }, [open]);

  const preview = selectedPlan ? previewTasks(selectedPlan, month, year) : [];
  const now = new Date();
  const yearOptions = [now.getFullYear(), now.getFullYear() + 1];

  async function handleApply() {
    if (!selectedPlan) return;
    setLoading(true);

    const res = await fetch(`/api/clients/${clientId}/apply-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: selectedPlan.id,
        month,
        year,
        autoRenew,
        clearExistingTasks,
      }),
    });

    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setCreatedCount(data.tasks?.length ?? 0);
      setSuccess(true);
      setStep(3);
    }
  }

  function handleClose() {
    setStep(1);
    setSelectedPlan(null);
    setSuccess(false);
    setCreatedCount(0);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Ativar Plano — ${clientName}`}
      size="lg"
      footer={
        step === 1 ? (
          <>
            <div style={{ flex: 1 }} />
            <Button variant="primary" size="sm" disabled={!selectedPlan} onClick={() => setStep(2)}>
              Ver preview →
            </Button>
          </>
        ) : step === 2 ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Voltar</Button>
            <div style={{ flex: 1 }} />
            <Button variant="primary" size="sm" loading={loading} onClick={handleApply}>
              <Zap size={12} /> Ativar plano
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={() => { handleClose(); onSuccess(); }}>
            Concluído
          </Button>
        )
      }
    >
      {/* Steps */}
      {step < 3 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          {[1, 2].map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 24, height: 24, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600,
                  background: s <= step ? "var(--accent)" : "var(--bg-elevated)",
                  color: s <= step ? "#fff" : "var(--text-muted)",
                }}
              >
                {s}
              </div>
              {s < 2 && (
                <div style={{ width: 32, height: 1, background: s < step ? "var(--accent)" : "var(--border)" }} />
              )}
            </div>
          ))}
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
            {step === 1 ? "Selecionar plano e período" : "Confirmar e ativar"}
          </span>
        </div>
      )}

      {/* Step 1: selecionar plano + mês/ano */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Mês / Ano */}
          <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Mês</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-secondary)", fontSize: 13, outline: "none" }}
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ano</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-secondary)", fontSize: 13, outline: "none" }}
              >
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Selecionar plano</p>
          {plans.map((plan) => {
            const totalTasks = plan.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "14px 16px", borderRadius: 10, border: "1px solid",
                  borderColor: selectedPlan?.id === plan.id ? "var(--accent)" : "var(--border)",
                  background: selectedPlan?.id === plan.id ? "var(--accent-soft)" : "var(--bg-elevated)",
                  textAlign: "left", width: "100%", cursor: "pointer",
                  transition: "border-color 150ms, background 150ms",
                }}
              >
                <div
                  style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: "rgba(139,92,246,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <BookOpen size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{plan.name}</p>
                  {plan.description && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{plan.description}</p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {plan.items.map((item) => (
                      <Badge key={item.id} variant="gray">{item.type}: {item.quantity}x</Badge>
                    ))}
                    <Badge variant="blue">{totalTasks} tarefas</Badge>
                  </div>
                </div>
                {selectedPlan?.id === plan.id && (
                  <CheckCircle2 size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Step 2: preview + opção autoRenew */}
      {step === 2 && selectedPlan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Resumo do plano */}
          <div
            style={{
              padding: "12px 16px", borderRadius: 10,
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{selectedPlan.name}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {MONTHS[month - 1]}/{year} · {preview.length} tarefas serão geradas automaticamente
            </p>
          </div>

          {/* Preview das tarefas */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Tarefas que serão criadas
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
              {preview.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", borderRadius: 8,
                    background: "var(--bg-elevated)", border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</p>
                    {t.checklist.length > 0 && (
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {t.checklist.join(" → ")}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20,
                        color: PRIORITY_COLOR[t.priority],
                        background: PRIORITY_COLOR[t.priority] + "18",
                      }}
                    >
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      dia {t.dueDate.getDate()}/{t.dueDate.getMonth() + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Opção de substituir tarefas existentes */}
          <button
            type="button"
            onClick={() => setClearExistingTasks((v) => !v)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 16px", borderRadius: 10,
              border: `1px solid ${clearExistingTasks ? "var(--amber)" : "var(--border)"}`,
              background: clearExistingTasks ? "var(--amber-soft)" : "var(--bg-elevated)",
              cursor: "pointer", textAlign: "left", width: "100%",
              transition: "border-color 150ms, background 150ms",
            }}
          >
            <div
              style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                border: `2px solid ${clearExistingTasks ? "var(--amber)" : "var(--border)"}`,
                background: clearExistingTasks ? "var(--amber)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {clearExistingTasks && <CheckCircle2 size={10} color="#fff" />}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>
                Substituir tarefas do mês selecionado
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                Remove as tarefas existentes de {MONTHS[month - 1]}/{year} antes de gerar as novas. Recomendado ao trocar de plano.
              </p>
            </div>
          </button>

          {/* Opção de auto-renovação */}
          <button
            type="button"
            onClick={() => setAutoRenew((v) => !v)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 16px", borderRadius: 10,
              border: `1px solid ${autoRenew ? "var(--accent)" : "var(--border)"}`,
              background: autoRenew ? "var(--accent-soft)" : "var(--bg-elevated)",
              cursor: "pointer", textAlign: "left", width: "100%",
              transition: "border-color 150ms, background 150ms",
            }}
          >
            <div
              style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                border: `2px solid ${autoRenew ? "var(--accent)" : "var(--border)"}`,
                background: autoRenew ? "var(--accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {autoRenew && <CheckCircle2 size={10} color="#fff" />}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <RefreshCw size={12} style={{ color: autoRenew ? "var(--accent)" : "var(--text-muted)" }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Renovação automática</p>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                No início de cada mês, o sistema gera automaticamente as tarefas deste plano sem nenhuma ação da equipe.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Step 3: Sucesso */}
      {step === 3 && success && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "24px 0" }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(16,185,129,0.12)", marginBottom: 16,
            }}
          >
            <CheckCircle2 size={28} style={{ color: "var(--accent-green)" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            Plano ativado!
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
            <strong style={{ color: "var(--text-primary)" }}>{createdCount} tarefas</strong> criadas automaticamente para {clientName}
          </p>
          {autoRenew && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 20,
                background: "var(--accent-soft)", marginTop: 8,
              }}
            >
              <RefreshCw size={12} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)" }}>
                Renovação automática ativada
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
