"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, BookOpen, Users, Package, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PlanForm } from "@/components/plans/plan-form";

interface PlanItem {
  id: string;
  type: string;
  quantity: number;
  description?: string;
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  items: PlanItem[];
  _count: { clientPlans: number };
}

export function PlansContent() {
  const { data: session } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);

  async function load() {
    const res = await fetch("/api/plans");
    if (res.ok) setPlans(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const isAdmin = session?.user.role === "ADMIN";

  async function handleDelete(planId: string) {
    if (!confirm("Tem certeza que deseja excluir este plano?")) return;
    await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-7 pt-7 pb-5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Planos</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Templates de entrega reutilizáveis
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
            <Plus size={13} /> Novo Plano
          </Button>
        )}
      </div>

      <div className="px-7 py-6">
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 rounded-xl animate-pulse" style={{ background: "var(--bg-surface)" }} />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={40} className="mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Nenhum plano cadastrado</p>
            {isAdmin && (
              <button onClick={() => setNewOpen(true)} className="text-xs mt-2" style={{ color: "var(--accent-blue)" }}>
                Criar primeiro plano →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isAdmin={isAdmin}
                onEdit={() => setEditPlan(plan)}
                onDelete={() => handleDelete(plan.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Novo Plano" size="md">
        <PlanForm
          onSuccess={() => { setNewOpen(false); load(); }}
          onCancel={() => setNewOpen(false)}
        />
      </Modal>

      {editPlan && (
        <Modal open={!!editPlan} onClose={() => setEditPlan(null)} title="Editar Plano" size="md">
          <PlanForm
            plan={editPlan}
            onSuccess={() => { setEditPlan(null); load(); }}
            onCancel={() => setEditPlan(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function PlanCard({ plan, isAdmin, onEdit, onDelete }: {
  plan: Plan;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalMonthly = plan.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className="rounded-xl border p-5 group"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.12)" }}>
            <BookOpen size={16} style={{ color: "var(--accent-purple)" }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{plan.name}</h3>
            {plan.description && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{plan.description}</p>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-muted)" }}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={onDelete}
              className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--accent-red)" }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <Package size={11} style={{ color: "var(--text-muted)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {totalMonthly} entregas/mês
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users size={11} style={{ color: "var(--text-muted)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {plan._count.clientPlans} aplicações
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1.5">
        {plan.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.type}</span>
            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{item.quantity}x</span>
          </div>
        ))}
      </div>
    </div>
  );
}
