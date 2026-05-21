"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  KanbanSquare, CalendarDays, Edit2, Activity,
  AlertTriangle, CheckCircle2, Clock, BookOpen,
  ChevronRight, MessageSquarePlus, HeartPulse, Target,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, ClientStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "@/components/clients/client-form";
import { ApplyPlanWizard } from "@/components/plans/apply-plan-wizard";
import { formatDate } from "@/lib/utils";

interface ClientDetail {
  id: string;
  name: string;
  brand?: string;
  email?: string;
  phone?: string;
  primaryContact?: string;
  website?: string;
  instagram?: string;
  city?: string;
  status: "ACTIVE" | "INACTIVE" | "PAUSED";
  activePlanId?: string;
  operationType?: string;
  niche?: string;
  mainGoal?: string;
  contractStart?: string | null;
  operationalFrequency?: string;
  strategicNotes?: string;
  communicationTone?: string;
  restrictions?: string;
  preferences?: string;
  clientBehavior?: string;
  stats: {
    monthTasks: number;
    doneTasks: number;
    overdueTasks: number;
    openTasks: number;
    daysSinceActivity: number;
    health: "HEALTHY" | "ATTENTION" | "CRITICAL";
    completionRate: number;
  };
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
  operationalContext: {
    lastActivityAt: string | null;
    nextTask: { id: string; title: string; dueDate: string } | null;
    currentBlocker: { id: string; title: string; blocker: string | null } | null;
  };
  recentLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    user: { name: string };
    details?: Record<string, unknown>;
  }>;
  notes: Array<{
    id: string;
    action: string;
    createdAt: string;
    user: { name: string };
    details?: Record<string, unknown>;
  }>;
}

const actionLabels: Record<string, string> = {
  CREATE_TASK: "criou uma tarefa",
  UPDATE_STATUS: "moveu uma tarefa",
  DELETE_TASK: "removeu uma tarefa",
  APPLY_PLAN: "aplicou um plano",
  UPDATE_CLIENT: "atualizou o cliente",
  CREATE_CLIENT: "criou o cliente",
  ADD_NOTE: "adicionou uma observacao",
  CREATE_PLAN: "criou um plano",
};

const actionColors: Record<string, string> = {
  CREATE_TASK: "var(--blue)",
  UPDATE_STATUS: "var(--accent)",
  DELETE_TASK: "var(--red)",
  APPLY_PLAN: "var(--green)",
  UPDATE_CLIENT: "var(--amber)",
  CREATE_CLIENT: "var(--green)",
  ADD_NOTE: "var(--text-secondary)",
  CREATE_PLAN: "var(--accent)",
};

const months = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

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

function getLogTitle(log: ClientDetail["recentLogs"][0]) {
  const details = log.details ?? {};
  const title = typeof details.title === "string" ? details.title : undefined;
  const note = typeof details.note === "string" ? details.note : undefined;

  if (log.action === "CREATE_TASK" && title) return title;
  if (log.action === "ADD_NOTE" && note) return "Observacao interna";
  if (log.action === "UPDATE_STATUS") return "Status alterado";
  if (log.action === "APPLY_PLAN") return "Plano aplicado";
  if (log.action === "DELETE_TASK") return "Tarefa removida";
  return actionLabels[log.action] ?? "Atividade registrada";
}

function getLogMeta(log: ClientDetail["recentLogs"][0]) {
  const details = log.details ?? {};
  const note = typeof details.note === "string" ? details.note : undefined;
  const to = typeof details.to === "string" ? details.to : undefined;
  const dueDate = typeof details.dueDate === "string" ? details.dueDate : undefined;

  if (note) return note;
  if (to) return `Status alterado para ${to}`;
  if (dueDate) return `Prazo ${formatDate(dueDate)}`;
  return actionLabels[log.action] ?? log.action;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `ha ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ha ${hours}h`;
  const days = Math.floor(hours / 24);
  return `ha ${days}d`;
}

export function ClientDetailContent({ clientId }: { clientId: string }) {
  const { data: session } = useSession();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [planWizardOpen, setPlanWizardOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}`);
    if (res.ok) setClient(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  const isAdmin = session?.user.role === "ADMIN";
  const currentPlan = client?.clientPlans?.[0];

  if (loading) return (
    <div style={{ flex: 1, padding: 32 }}>
      <div style={{ height: 88, borderRadius: 12, background: "var(--bg-surface)", marginBottom: 16, animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 80, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
        ))}
      </div>
    </div>
  );

  if (!client) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
      Cliente não encontrado
    </div>
  );

  const latestNote = client.notes.find((log) => typeof log.details?.note === "string");
  const operationalMemory = [
    {
      label: "Ultima decisao registrada",
      value: latestNote && typeof latestNote.details?.note === "string" ? latestNote.details.note : "Nenhuma nota operacional ainda",
      tone: latestNote ? "var(--accent)" : "var(--text-muted)",
    },
    {
      label: "Ritmo do cliente",
      value: client.stats.daysSinceActivity === 999
        ? "Sem historico suficiente"
        : client.stats.daysSinceActivity >= 5
          ? `Sem movimento ha ${client.stats.daysSinceActivity} dias`
          : "Contato recente e operacao ativa",
      tone: client.stats.daysSinceActivity >= 5 || client.stats.daysSinceActivity === 999 ? "var(--amber)" : "var(--green)",
    },
    {
      label: "Proxima acao natural",
      value: client.operationalContext.currentBlocker?.blocker
        ? `Destravar: ${client.operationalContext.currentBlocker.blocker}`
        : client.operationalContext.nextTask
          ? `Preparar ${client.operationalContext.nextTask.title}`
          : "Planejar nova entrega",
      tone: client.operationalContext.currentBlocker ? "var(--red)" : "var(--blue)",
    },
  ];
  const clientAreas = [
    { label: "Operacao", value: client.operationType ?? "Nao definido", tone: "var(--accent)" },
    { label: "Calendario", value: client.operationalFrequency ?? "Sem ritual", tone: "var(--blue)" },
    { label: "Timeline", value: `${client.recentLogs.length} registros`, tone: "var(--green)" },
    { label: "Pendencias", value: client.operationalContext.currentBlocker?.blocker ?? "Sem bloqueio", tone: client.operationalContext.currentBlocker ? "var(--amber)" : "var(--green)" },
    { label: "Contexto", value: client.niche ?? "Nicho aberto", tone: "var(--accent)" },
    { label: "Planejamento", value: currentPlan?.plan.name ?? "Sem plano ativo", tone: "var(--blue)" },
  ];

  async function saveNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    const res = await fetch(`/api/clients/${clientId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() }),
    });
    setSavingNote(false);
    if (res.ok) {
      setNote("");
      load();
    }
  }

  const healthConfig = {
    HEALTHY: { label: "Operacao saudavel", color: "var(--green)", bg: "var(--green-soft)" },
    ATTENTION: { label: "Atencao", color: "var(--amber)", bg: "var(--amber-soft)" },
    CRITICAL: { label: "Critico", color: "var(--red)", bg: "var(--red-soft)" },
  }[client.stats.health];
  const nextAction = client.operationalContext.currentBlocker?.blocker
    ? `Destravar ${client.operationalContext.currentBlocker.blocker}`
    : client.operationalContext.nextTask?.title ?? "Planejar proxima entrega";
  const lastActivity = client.operationalContext.lastActivityAt ? timeAgo(client.operationalContext.lastActivityAt) : "sem registro";
  const currentPending = client.operationalContext.currentBlocker?.title
    ?? (client.stats.overdueTasks > 0 ? `${client.stats.overdueTasks} entrega${client.stats.overdueTasks === 1 ? "" : "s"} em atraso` : "sem pendencia critica");

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          padding: "20px 28px",
          flexShrink: 0,
        }}
      >
        {/* Top row: avatar + name + action buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          {/* Left: identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Avatar name={client.name} size="md" />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    lineHeight: "24px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {client.name}
                </h1>
                <ClientStatusBadge status={client.status} />
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    borderRadius: 7,
                    background: healthConfig.bg,
                    color: healthConfig.color,
                    fontSize: 11,
                    fontWeight: 650,
                  }}
                >
                  <HeartPulse size={12} />
                  {healthConfig.label}
                </span>
                {currentPlan && (
                  <Badge variant="purple">{currentPlan.plan.name}</Badge>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                {client.email && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{client.email}</span>
                )}
                {client.phone && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{client.phone}</span>
                )}
                {client.primaryContact && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Resp. {client.primaryContact}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Edit2 size={12} /> Editar
              </Button>
            )}
            <Link href={`/clients/${clientId}/tasks`} style={{ textDecoration: "none" }}>
              <Button variant="ghost" size="sm">
                <KanbanSquare size={12} /> Kanban
              </Button>
            </Link>
            <Link href={`/clients/${clientId}/calendar`} style={{ textDecoration: "none" }}>
              <Button variant="ghost" size="sm">
                <CalendarDays size={12} /> Calendário
              </Button>
            </Link>
            <Button variant="primary" size="sm" onClick={() => setPlanWizardOpen(true)}>
              <BookOpen size={12} /> Aplicar Plano
            </Button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 0.75fr 1fr 0.8fr",
            gap: 18,
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          <SummaryLine label="Proxima acao" value={nextAction} tone={client.operationalContext.currentBlocker ? "var(--amber)" : "var(--accent)"} primary />
          <SummaryLine label="Ultima atividade" value={lastActivity} tone={client.stats.daysSinceActivity >= 4 ? "var(--amber)" : "var(--green)"} />
          <SummaryLine label="Pendencia" value={currentPending} tone={client.operationalContext.currentBlocker || client.stats.overdueTasks > 0 ? "var(--red)" : "var(--green)"} />
          <SummaryLine label="Plano" value={currentPlan?.plan.name ?? "sem plano ativo"} tone="var(--blue)" />
        </div>

        {/* Stat chips row */}
        <div
          style={{
            display: "none",
            gap: 8,
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <StatChip icon={Clock} label="Tarefas no mês" value={client.stats.monthTasks} color="var(--blue)" />
          <StatChip icon={CheckCircle2} label="Concluídas" value={client.stats.doneTasks} color="var(--green)" />
          <StatChip icon={AlertTriangle} label="Em atraso" value={client.stats.overdueTasks} color="var(--red)" alert={client.stats.overdueTasks > 0} />
          <StatChip icon={Activity} label="Sem atividade" value={client.stats.daysSinceActivity === 999 ? "N/A" : `${client.stats.daysSinceActivity}d`} color="var(--amber)" alert={client.stats.daysSinceActivity >= 4} />
          <StatChip
            icon={BookOpen}
            label="Plano ativo"
            value={currentPlan?.plan.name ?? "—"}
            color="var(--accent)"
            small
          />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: "24px 28px",
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 12,
              }}
            >
              Contexto Operacional
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <ContextTile
                label="Ultima atividade"
                value={client.operationalContext.lastActivityAt ? timeAgo(client.operationalContext.lastActivityAt) : "Sem registro"}
                tone={client.stats.daysSinceActivity >= 4 ? "var(--amber)" : "var(--green)"}
              />
              <ContextTile
                label="Proxima entrega"
                value={client.operationalContext.nextTask ? formatDate(client.operationalContext.nextTask.dueDate) : "Nada programado"}
                detail={client.operationalContext.nextTask?.title}
                tone={client.operationalContext.nextTask ? "var(--blue)" : "var(--red)"}
              />
              <ContextTile
                label="Pendencia atual"
                value={client.operationalContext.currentBlocker?.blocker ?? "Sem bloqueio"}
                detail={client.operationalContext.currentBlocker?.title}
                tone={client.operationalContext.currentBlocker ? "var(--amber)" : "var(--green)"}
              />
            </div>
          </section>

          <section>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 12,
              }}
            >
              Memoria Operacional
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {operationalMemory.map((item) => (
                <MemoryTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
              ))}
            </div>
          </section>

          <section>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 12,
              }}
            >
              Areas do Cliente
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {clientAreas.map((area) => (
                <AreaTile key={area.label} label={area.label} value={area.value} tone={area.tone} />
              ))}
            </div>
          </section>

          {/* Acesso Rápido */}
          <section>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 12,
              }}
            >
              Acesso Rápido
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <QuickAccessCard
                href={`/clients/${clientId}/tasks`}
                icon={<KanbanSquare size={18} style={{ color: "var(--accent)" }} />}
                iconBg="var(--accent-soft)"
                title="Kanban de Tarefas"
                description="Gerenciar execução"
              />
              <QuickAccessCard
                href={`/clients/${clientId}/calendar`}
                icon={<CalendarDays size={18} style={{ color: "var(--blue)" }} />}
                iconBg="var(--blue-soft)"
                title="Calendário Mensal"
                description="Visualizar distribuição"
              />
            </div>
          </section>

          {/* Progresso do Plano */}
          {currentPlan && (
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  Progresso do Plano
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    background: "var(--bg-elevated)",
                    padding: "2px 8px",
                    borderRadius: 20,
                  }}
                >
                  {months[currentPlan.month - 1]}/{currentPlan.year}
                </span>
              </div>

              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                {currentPlan.plan.items.map((item) => {
                  const done = Math.min(client.stats.doneTasks, item.quantity);
                  const pct = item.quantity > 0
                    ? Math.min(100, Math.round((done / item.quantity) * 100))
                    : 0;
                  const barColor = pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--amber)" : "var(--red)";
                  const typeSty = getTypeStyle(item.type);

                  return (
                    <div key={item.id}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        {/* Type badge */}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            background: typeSty.bg,
                            color: typeSty.color,
                            padding: "2px 8px",
                            borderRadius: 20,
                          }}
                        >
                          {item.type}
                        </span>
                        {/* Count + percentage */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {done}/{item.quantity}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: barColor,
                              minWidth: 36,
                              textAlign: "right",
                            }}
                          >
                            {pct}%
                          </span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div
                        style={{
                          height: 4,
                          borderRadius: 2,
                          background: "var(--bg-elevated)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: barColor,
                            borderRadius: 2,
                            transition: "width 400ms ease-out",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                Observacoes Internas
              </h2>
              <MessageSquarePlus size={14} style={{ color: "var(--text-muted)" }} />
            </div>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
              <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ex: prefere aprovar pelo WhatsApp, evitar domingo..."
                  rows={3}
                  style={{ width: "100%", resize: "none", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-base)", color: "var(--text-primary)", padding: 10, fontSize: 13, outline: "none" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <Button type="button" variant="secondary" size="sm" loading={savingNote} onClick={saveNote}>
                    Salvar observacao
                  </Button>
                </div>
              </div>
              {client.notes.length === 0 ? (
                <p style={{ padding: 14, fontSize: 12, color: "var(--text-muted)" }}>Nenhuma observacao interna ainda.</p>
              ) : (
                client.notes.slice(0, 5).map((log) => (
                  <div key={log.id} style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                    <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: "18px" }}>
                      {typeof log.details?.note === "string" ? log.details.note : "Observacao registrada"}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                      {log.user.name} / {formatDate(log.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN - Timeline */}
        <div>
          <h2
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 12,
            }}
          >
            Timeline do Cliente
          </h2>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 0",
              boxShadow: "var(--shadow-card)",
            }}
          >
            {client.recentLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <Activity size={24} style={{ color: "var(--text-muted)", opacity: 0.3, margin: "0 auto 8px" }} />
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhuma atividade registrada</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {client.recentLogs.map((log, i) => {
                  const dotColor = actionColors[log.action] ?? "var(--blue)";
                  return (
                    <div
                      key={log.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 9,
                        padding: "9px 13px",
                        borderBottom: i < client.recentLogs.length - 1 ? "1px solid var(--border)" : "none",
                        position: "relative",
                        animation: "feedIn 220ms ease-out both",
                        animationDelay: `${Math.min(i * 28, 180)}ms`,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: dotColor,
                          boxShadow: `0 0 0 4px ${dotColor}16`,
                          marginTop: 6,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 650,
                            color: "var(--text-primary)",
                            lineHeight: "16px",
                          }}
                        >
                          {log.user.name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase()} / {getLogTitle(log)}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            marginTop: 3,
                            lineHeight: "16px",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {getLogMeta(log)}
                        </p>
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                          {timeAgo(log.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar perfil operacional" size="xl" variant="drawer">
        <ClientForm
          clientId={clientId}
          initial={{
            name: client.name,
            brand: client.brand,
            email: client.email,
            phone: client.phone,
            primaryContact: client.primaryContact,
            website: client.website,
            instagram: client.instagram,
            city: client.city,
            operationType: client.operationType,
            niche: client.niche,
            mainGoal: client.mainGoal,
            contractStart: client.contractStart,
            operationalFrequency: client.operationalFrequency,
            strategicNotes: client.strategicNotes,
            communicationTone: client.communicationTone,
            restrictions: client.restrictions,
            preferences: client.preferences,
            clientBehavior: client.clientBehavior,
          }}
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

function ContextTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: string;
}) {
  return (
    <div
      style={{
        minHeight: 64,
        padding: "0 0 12px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <Target size={12} style={{ color: tone }} />
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {label}
        </p>
      </div>
      <p style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </p>
      {detail && (
        <p style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {detail}
        </p>
      )}
    </div>
  );
}

function SummaryLine({ label, value, tone, primary }: { label: string; value: string; tone: string; primary?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, boxShadow: `0 0 0 4px ${tone}14`, flexShrink: 0 }} />
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {label}
        </p>
      </div>
      <p
        style={{
          fontSize: primary ? 15 : 13,
          fontWeight: primary ? 700 : 600,
          color: primary ? "var(--text-primary)" : "var(--text-secondary)",
          lineHeight: primary ? "20px" : "18px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function MemoryTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="op-enter"
      style={{
        minHeight: 82,
        padding: "0 0 12px",
        borderBottom: "1px solid var(--border)",
        background: "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: tone,
            boxShadow: `0 0 0 4px ${tone}16`,
            flexShrink: 0,
          }}
        />
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {label}
        </p>
      </div>
      <p
        style={{
          fontSize: 12,
          fontWeight: 560,
          color: "var(--text-primary)",
          lineHeight: "18px",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function AreaTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      style={{
        minHeight: 58,
        padding: "0 0 10px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {label}
        </p>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, boxShadow: `0 0 0 4px ${tone}14` }} />
      </div>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </p>
    </div>
  );
}

/* ─── Stat Chip ─────────────────────────────────────── */
function StatChip({
  icon: Icon,
  label,
  value,
  color,
  alert,
  small,
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 8,
        background: alert ? color + "12" : "var(--bg-elevated)",
        border: `1px solid ${alert ? color + "40" : "var(--border)"}`,
      }}
    >
      <Icon size={12} style={{ color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</span>
      <span
        style={{
          fontSize: small ? 12 : 14,
          fontWeight: 600,
          color: alert ? color : "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 120,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Quick Access Card ──────────────────────────────── */
function QuickAccessCard({
  href,
  icon,
  iconBg,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          cursor: "pointer",
          transition: "box-shadow 150ms ease-out, border-color 150ms ease-out",
          boxShadow: hovered ? "var(--shadow-hover)" : "var(--shadow-card)",
          borderColor: hovered ? "var(--border-strong)" : "var(--border)",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: hovered ? "var(--accent)" : "var(--text-primary)",
              transition: "color 150ms ease-out",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{description}</p>
        </div>
        <ChevronRight size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      </div>
    </Link>
  );
}
