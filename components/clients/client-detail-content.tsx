"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  KanbanSquare, CalendarDays, BookOpen, Edit2,
  AlertTriangle, CheckCircle2, Clock, Activity, ChevronRight
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, ClientStatusBadge, TaskStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "@/components/clients/client-form";
import { ApplyPlanWizard } from "@/components/plans/apply-plan-wizard";
import { formatDate } from "@/lib/utils";

interface ClientDetail {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: "ACTIVE" | "INACTIVE" | "PAUSED";
  activePlanId?: string;
  stats: { monthTasks: number; doneTasks: number; overdueTasks: number; completionRate: number };
  clientPlans: Array<{
    id: string;
    month: number;
    year: number;
    plan: {
      id: string;
      name: string;
      items: Array<{ id: string; type: string; quantity: number }>;
    };
  }>;
  recentLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    user: { name: string };
    details?: Record<string, unknown>;
  }>;
}

const actionLabels: Record<string, string> = {
  CREATE_TASK: "Tarefa criada",
  UPDATE_STATUS: "Status atualizado",
  DELETE_TASK: "Tarefa removida",
  APPLY_PLAN: "Plano aplicado",
  UPDATE_CLIENT: "Cliente atualizado",
  CREATE_CLIENT: "Cliente criado",
};

const months = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

export function ClientDetailContent({ clientId }: { clientId: string }) {
  const { data: session } = useSession();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [planWizardOpen, setPlanWizardOpen] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}`);
    if (res.ok) setClient(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  const isAdmin = session?.user.role === "ADMIN";
  const currentPlan = client?.clientPlans?.[0];
  const now = new Date();

  if (loading) return (
    <div className="flex-1 p-7">
      <div className="h-24 rounded-xl animate-pulse mb-4" style={{ background: "var(--bg-surface)" }} />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--bg-surface)" }} />
        ))}
      </div>
    </div>
  );

  if (!client) return (
    <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
      Cliente não encontrado
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Client header */}
      <div className="px-7 pt-7 pb-5 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={client.name} size="md" />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{client.name}</h1>
                <ClientStatusBadge status={client.status} />
                {currentPlan && (
                  <Badge variant="blue">{currentPlan.plan.name}</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {client.email && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{client.email}</span>}
                {client.phone && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{client.phone}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Edit2 size={12} /> Editar
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setPlanWizardOpen(true)}>
              <BookOpen size={12} /> Aplicar Plano
            </Button>
          </div>
        </div>
      </div>

      <div className="px-7 py-6 flex flex-col gap-6">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={Clock} label="Tarefas no mês" value={client.stats.monthTasks} color="var(--accent-blue)" />
          <StatCard icon={CheckCircle2} label="Concluídas" value={`${client.stats.completionRate}%`} color="var(--accent-green)" />
          <StatCard icon={AlertTriangle} label="Em atraso" value={client.stats.overdueTasks} color="var(--accent-red)" alert={client.stats.overdueTasks > 0} />
          <StatCard icon={BookOpen} label="Plano ativo" value={currentPlan?.plan.name ?? "—"} color="var(--accent-purple)" small />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/clients/${clientId}/tasks`}>
            <div className="rounded-xl border p-4 flex items-center gap-3 hover:border-[var(--border-strong)] cursor-pointer group transition-colors" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-soft)" }}>
                <KanbanSquare size={16} style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-violet-600 transition-colors" style={{ color: "var(--text-primary)" }}>Kanban de Tarefas</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Gerenciar execução</p>
              </div>
              <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
            </div>
          </Link>

          <Link href={`/clients/${clientId}/calendar`}>
            <div className="rounded-xl border p-4 flex items-center gap-3 hover:border-[var(--border-strong)] cursor-pointer group transition-colors" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--blue-soft)" }}>
                <CalendarDays size={16} style={{ color: "var(--blue)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-violet-600 transition-colors" style={{ color: "var(--text-primary)" }}>Calendário Mensal</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Visualizar distribuição</p>
              </div>
              <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Plan progress */}
          {currentPlan && (
            <div className="col-span-2">
              <PlanProgress client={client} currentPlan={currentPlan} />
            </div>
          )}

          {/* Activity feed */}
          <div className={currentPlan ? "" : "col-span-3"}>
            <ActivityFeed logs={client.recentLogs} />
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Cliente" size="sm">
        <ClientForm
          clientId={clientId}
          initial={{ name: client.name, email: client.email, phone: client.phone }}
          onSuccess={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <ApplyPlanWizard
        open={planWizardOpen}
        onClose={() => setPlanWizardOpen(false)}
        clientId={clientId}
        clientName={client.name}
        onSuccess={() => { setPlanWizardOpen(false); load(); }}
      />
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, color, alert, small
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  alert?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--bg-surface)", borderColor: alert ? color : "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      </div>
      <p className={`font-bold ${small ? "text-sm" : "text-2xl"} tracking-tight truncate`} style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function PlanProgress({ client, currentPlan }: { client: ClientDetail; currentPlan: ClientDetail["clientPlans"][0] }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Progresso do Plano — {currentPlan.plan.name}
        </h3>
        <Badge variant="gray">
          {months[currentPlan.month - 1]}/{currentPlan.year}
        </Badge>
      </div>
      <div className="flex flex-col gap-3">
        {currentPlan.plan.items.map((item) => {
          const pct = Math.min(100, Math.round((client.stats.doneTasks / item.quantity) * 100));
          return (
            <div key={item.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{item.type}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {Math.min(client.stats.doneTasks, item.quantity)}/{item.quantity}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 100 ? "var(--accent-green)" : pct >= 60 ? "var(--accent-blue)" : "var(--accent-amber)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed({ logs }: { logs: ClientDetail["recentLogs"] }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Activity size={13} style={{ color: "var(--accent-blue)" }} />
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Atividade Recente</h3>
      </div>
      {logs.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma atividade registrada</p>
      ) : (
        <div className="flex flex-col">
          {logs.map((log, i) => (
            <div key={log.id} className="flex items-start gap-3 pb-3 relative">
              {i < logs.length - 1 && (
                <div
                  className="absolute left-2 top-5 w-px"
                  style={{ height: "calc(100% - 4px)", background: "var(--border)" }}
                />
              )}
              <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 z-10" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent-blue)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                  {actionLabels[log.action] ?? log.action}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {log.user.name} · {formatDate(log.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
