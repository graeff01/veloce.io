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
  category?: string;
  frequency?: string;
  intensity?: string;
  averageDeadlineDays?: number | null;
  reviewDays?: number | null;
  demandLimit?: number | null;
  items: PlanItem[];
  _count: { clientPlans: number };
}

const typeColors: Record<string, { bg: string; color: string }> = {
  "Post Feed": { bg: "var(--blue-soft)",   color: "var(--blue)" },
  "Story":     { bg: "var(--accent-soft)", color: "var(--accent)" },
  "Campanha":  { bg: "var(--amber-soft)",  color: "var(--amber)" },
  "Criativo":  { bg: "var(--green-soft)",  color: "var(--green)" },
  "Reels":     { bg: "#FFF3E0",            color: "#F97316" },
  "Copy":      { bg: "var(--blue-soft)",   color: "var(--blue)" },
  "Relatório": { bg: "var(--bg-elevated)", color: "var(--text-secondary)" },
};

function getTypeStyle(type: string) {
  return typeColors[type] ?? { bg: "var(--bg-elevated)", color: "var(--text-secondary)" };
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const isAdmin = session?.user.role === "ADMIN";

  async function handleDelete(planId: string) {
    if (!confirm("Tem certeza que deseja excluir este plano?")) return;
    await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    load();
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>

      {/* ── Header ──────────────────────────────────── */}
      <div
        style={{
          padding: "24px 32px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>
            Planos
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Templates de entrega reutilizáveis
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
            <Plus size={13} /> Novo Plano
          </Button>
        )}
      </div>

      <div style={{ padding: "24px 32px" }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 200,
                  borderRadius: 10,
                  background: "var(--bg-surface)",
                  animation: "pulse 1.5s infinite",
                }}
              />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "72px 20px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "var(--accent-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <BookOpen size={24} style={{ color: "var(--accent)", opacity: 0.7 }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
              Nenhum ritual de entrega criado
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Crie templates de entrega para aplicar nos clientes
            </p>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                <Plus size={12} /> Criar primeiro plano
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Novo ritual operacional" size="lg" variant="drawer">
        <PlanForm
          onSuccess={() => { setNewOpen(false); load(); }}
          onCancel={() => setNewOpen(false)}
        />
      </Modal>

      {editPlan && (
        <Modal open={!!editPlan} onClose={() => setEditPlan(null)} title="Editar ritual operacional" size="lg" variant="drawer">
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

/* ─── Plan Card ──────────────────────────────────────── */
function PlanCard({
  plan,
  isAdmin,
  onEdit,
  onDelete,
}: {
  plan: Plan;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const totalMonthly = plan.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "18px 20px",
        boxShadow: hovered ? "var(--shadow-hover)" : "var(--shadow-card)",
        transition: "box-shadow 150ms ease-out, border-color 150ms ease-out",
        borderColor: hovered ? "var(--border-strong)" : "var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--accent-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BookOpen size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: "19px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {plan.name}
            </h3>
            {plan.description && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {plan.description}
              </p>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
              {[plan.category, plan.frequency, plan.intensity].filter(Boolean).map((item) => (
                <span key={item} style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-soft)", borderRadius: "var(--radius-pill)", padding: "2px 7px", fontWeight: 650 }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Admin actions (visible on hover) */}
        {isAdmin && (
          <div
            style={{
              display: "flex",
              gap: 4,
              opacity: hovered ? 1 : 0,
              transition: "opacity 150ms ease-out",
              flexShrink: 0,
            }}
          >
            <button
              onClick={onEdit}
              title="Editar"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                transition: "background 150ms ease-out",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "none")
              }
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={onDelete}
              title="Excluir"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--red)",
                transition: "background 150ms ease-out",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "var(--red-soft)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = "none")
              }
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "8px 10px",
          background: "var(--bg-elevated)",
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Package size={11} style={{ color: "var(--text-muted)" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {totalMonthly} entregas/mês
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={11} style={{ color: "var(--text-muted)" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {plan._count.clientPlans} aplicações
          </span>
        </div>
        {(plan.averageDeadlineDays || plan.reviewDays || plan.demandLimit) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              SLA {plan.averageDeadlineDays ?? "?"}d / revisao {plan.reviewDays ?? "?"}d / limite {plan.demandLimit ?? "livre"}
            </span>
          </div>
        )}
      </div>

      {/* Plan items breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {plan.items.map((item) => {
          const sty = getTypeStyle(item.type);
          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                borderRadius: 7,
                borderLeft: `3px solid ${sty.color}`,
                background: sty.bg,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: sty.color,
                  }}
                >
                  {item.type}
                </span>
                {item.description && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {item.description}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: sty.color,
                  background: "rgba(255,255,255,0.5)",
                  padding: "1px 7px",
                  borderRadius: 20,
                }}
              >
                {item.quantity}×
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
