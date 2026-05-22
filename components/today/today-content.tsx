"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  ListChecks,
  Radio,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";

type Task = {
  id: string;
  clientId: string;
  title: string;
  type?: string | null;
  status: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  blocker?: string | null;
  dueDate: string;
  client: { id: string; name: string };
  assignee?: { id: string; name: string } | null;
};

type InactiveClient = { id: string; name: string; daysSinceActivity: number };
type NoFutureClient = { id: string; name: string; futureTasks: number };
type Critical = { id: string; tone: "red" | "amber"; title: string; subtitle: string; href: string };

type TodayData = {
  summary: { dueToday: number; overdue: number; blocked: number; inactiveClients: number; noFutureClients: number; criticals: number; missingTasksClients?: number };
  dueToday: Task[];
  overdue: Task[];
  blocked: Task[];
  inactiveClients: InactiveClient[];
  noFutureClients: NoFutureClient[];
  clientsWithoutTasksThisMonth?: Array<{ id: string; name: string; planName: string }>;
  priorityTasks: Task[];
  urgentTasks: Task[];
  criticals: Critical[];
  generatedAt: string;
};

const fallback: TodayData = {
  summary: { dueToday: 0, overdue: 0, blocked: 0, inactiveClients: 0, noFutureClients: 0, criticals: 0 },
  dueToday: [],
  overdue: [],
  blocked: [],
  inactiveClients: [],
  noFutureClients: [],
  priorityTasks: [],
  urgentTasks: [],
  criticals: [],
  generatedAt: new Date().toISOString(),
};

function getOperationalBrief(data: TodayData) {
  if (data.summary.overdue > 0) {
    return {
      title: `${data.summary.overdue} entrega${data.summary.overdue === 1 ? "" : "s"} em atraso`,
      detail: "comece pelo que trava qualidade",
      color: "var(--red)",
      pulse: true,
    };
  }
  if (data.summary.blocked > 0) {
    return {
      title: `${data.summary.blocked} bloqueio${data.summary.blocked === 1 ? "" : "s"} pedindo decisao`,
      detail: "remova atrito antes de criar mais fila",
      color: "var(--amber)",
      pulse: true,
    };
  }
  if (data.summary.dueToday > 0) {
    return {
      title: `${data.summary.dueToday} entrega${data.summary.dueToday === 1 ? "" : "s"} para concluir hoje`,
      detail: "execucao clara, sem ruido",
      color: "var(--accent)",
      pulse: false,
    };
  }
  return {
    title: "Operacao tranquila hoje",
    detail: "sem urgencias abertas",
    color: "var(--green)",
    pulse: false,
  };
}

export function TodayContent() {
  const [data, setData] = useState<TodayData>(fallback);
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    fetch("/api/today")
      .then((res) => (res.ok ? res.json() : fallback))
      .then(setData)
      .catch(() => setData(fallback))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const riskClients = [
    ...data.inactiveClients.map((client) => ({
      id: client.id,
      name: client.name,
      reason: client.daysSinceActivity === 999 ? "Sem atividade registrada" : `${client.daysSinceActivity} dias sem movimento`,
      tone: client.daysSinceActivity >= 8 || client.daysSinceActivity === 999 ? "red" : "amber",
    })),
    ...data.noFutureClients.map((client) => ({
      id: client.id,
      name: client.name,
      reason: "Sem proxima entrega programada",
      tone: "blue",
    })),
  ].filter((client, index, arr) => arr.findIndex((item) => item.id === client.id) === index).slice(0, 8);
  const ritualItems = [
    { label: "Revisar clientes criticos", active: data.criticals.length > 0 },
    { label: "Validar entregas de hoje", active: data.dueToday.length > 0 },
    { label: "Destravar pendencias", active: data.blocked.length > 0 },
  ];
  const brief = getOperationalBrief(data);
  const liveSignals = [
    `${data.summary.dueToday} entrega${data.summary.dueToday === 1 ? "" : "s"} hoje`,
    `${data.summary.blocked} bloqueio${data.summary.blocked === 1 ? "" : "s"} aberto${data.summary.blocked === 1 ? "" : "s"}`,
    `${data.summary.inactiveClients + data.summary.noFutureClients} cliente${data.summary.inactiveClients + data.summary.noFutureClients === 1 ? "" : "s"} pedindo contexto`,
  ];

  if (loading) return <TodaySkeleton />;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div
        className="op-enter"
        style={{
          background: "linear-gradient(180deg, var(--bg-surface), var(--bg-panel))",
          borderBottom: "1px solid var(--border)",
          padding: "22px 32px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
              <CalendarCheck2 size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 20, fontWeight: 650, color: "var(--text-primary)", lineHeight: "26px" }}>
                Hoje
              </h1>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "capitalize" }}>
              {today}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, color: brief.color }}>
              <span
                className={brief.pulse ? "live-dot" : undefined}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: brief.color,
                  boxShadow: `0 0 0 4px ${brief.color}18`,
                  flexShrink: 0,
                }}
              />
              <p style={{ fontSize: 13, fontWeight: 600, lineHeight: "18px" }}>{brief.title}</p>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{brief.detail}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFocusMode((value) => !value)}
            style={{
              height: 34,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: focusMode ? "var(--text-primary)" : "var(--bg-base)",
              color: focusMode ? "#fff" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Search size={13} />
            {focusMode ? "Modo foco ativo" : "Modo foco"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          {liveSignals.map((signal, index) => (
            <span
              key={signal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                height: 28,
                padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-pill)",
                background: index === 0 ? "var(--accent-soft)" : "var(--bg-base)",
                color: index === 0 ? "var(--accent)" : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 560,
              }}
            >
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor", opacity: 0.72 }} />
              {signal}
            </span>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
          <PulseMetric label="Urgente" value={data.urgentTasks.length} color="var(--red)" alert={data.urgentTasks.length > 0} />
          <PulseMetric label="Hoje" value={data.summary.dueToday} color="var(--amber)" />
          <PulseMetric label="Bloqueado" value={data.summary.blocked} color="var(--accent)" alert={data.summary.blocked > 0} />
          <PulseMetric label="Sem movimento" value={data.summary.inactiveClients + data.summary.noFutureClients} color="var(--blue)" />
        </div>
      </div>

      <div style={{ padding: "22px 32px 32px", display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, 0.8fr)", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section>
            <SectionHeader title="Inicio do dia" count={ritualItems.filter((item) => item.active).length} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {ritualItems.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 42,
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: item.active ? "var(--bg-surface)" : "var(--bg-base)",
                    color: item.active ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: item.active ? "var(--shadow-card)" : "none",
                  }}
                >
                  <ListChecks size={13} style={{ color: item.active ? "var(--accent)" : "var(--text-muted)" }} />
                  <span style={{ fontSize: 12, fontWeight: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <SectionHeader title="Urgente" count={data.urgentTasks.length} />
          <OperationalList empty="Operacao tranquila agora.">
            {data.urgentTasks.map((task) => <TaskRow key={task.id} task={task} />)}
          </OperationalList>

          {!focusMode && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <SectionHeader title="Vencendo hoje" count={data.dueToday.length} />
              <OperationalList compact empty="Agenda do dia respirando.">
                {data.dueToday.slice(0, 8).map((task) => <TaskRow key={task.id} task={task} compact />)}
              </OperationalList>
            </div>
            <div>
              <SectionHeader title="Bloqueado" count={data.blocked.length} />
              <OperationalList compact empty="Nenhum gargalo ativo.">
                {data.blocked.slice(0, 8).map((task) => <TaskRow key={task.id} task={task} compact overdue />)}
              </OperationalList>
            </div>
          </div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {!focusMode && (
            <>
          <SectionHeader title="Pendencias criticas" count={data.criticals.length} />
          <OperationalList empty="Nenhuma pendencia critica.">
            {data.criticals.map((item) => <CriticalRow key={item.id} item={item} />)}
          </OperationalList>

          <SectionHeader title="Clientes precisando atencao" count={riskClients.length} />
          <OperationalList compact empty="Carteira sob controle.">
            {riskClients.map((client) => <RiskClientRow key={client.id} client={client} />)}
          </OperationalList>

          {(data.clientsWithoutTasksThisMonth?.length ?? 0) > 0 && (
            <>
              <SectionHeader title="Sem tasks este mes" count={data.clientsWithoutTasksThisMonth!.length} />
              <OperationalList compact empty="">
                {data.clientsWithoutTasksThisMonth!.map((client) => (
                  <RiskClientRow
                    key={client.id}
                    client={{ id: client.id, name: client.name, reason: `Plano "${client.planName}" sem tasks geradas`, tone: "amber" }}
                  />
                ))}
              </OperationalList>
            </>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PulseMetric({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div
      className="op-enter"
      style={{
        background: alert ? `${color}10` : "var(--bg-base)",
        border: `1px solid ${alert ? `${color}45` : "var(--border)"}`,
        borderRadius: "var(--radius-card)",
        padding: "11px 12px",
        minHeight: 66,
        boxShadow: alert ? `0 0 0 1px ${color}12, var(--shadow-card)` : "var(--shadow-card)",
        transition: "transform var(--motion-hover) var(--ease-enter), border-color var(--motion-hover) var(--ease-enter)",
      }}
    >
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{label}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: alert ? color : "var(--text-primary)", lineHeight: 1 }}>
          {value}
        </span>
        {alert && <Radio size={13} style={{ color }} />}
      </div>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {title}
      </h2>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{count}</span>
    </div>
  );
}

function OperationalList({ children, empty, compact }: { children: React.ReactNode; empty: string; compact?: boolean }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
        minHeight: compact ? 92 : 132,
      }}
    >
      {hasChildren ? children : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: compact ? 92 : 132, color: "var(--text-muted)", fontSize: 12 }}>
          <CheckCircle2 size={14} />
          {empty}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, compact, overdue }: { task: Task; compact?: boolean; overdue?: boolean }) {
  return (
    <Link href={`/clients/${task.clientId}/tasks`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr auto" : "1fr 128px 120px auto",
          gap: 12,
          alignItems: "center",
          minHeight: compact ? 54 : 62,
          padding: compact ? "9px 12px" : "10px 14px",
          borderBottom: "1px solid var(--border)",
          transition: "background var(--motion-hover) var(--ease-enter), transform var(--motion-hover) var(--ease-enter)",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "var(--bg-elevated)";
          event.currentTarget.style.transform = "translateX(2px)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent";
          event.currentTarget.style.transform = "translateX(0)";
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 540, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.title}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.client.name}{task.type ? ` / ${task.type}` : ""}{task.blocker ? ` / ${task.blocker}` : ""}
          </p>
        </div>
        {!compact && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <Clock3 size={12} style={{ color: overdue ? "var(--red)" : "var(--text-muted)" }} />
            {formatDate(task.dueDate)}
          </span>
        )}
        {!compact && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", minWidth: 0 }}>
            <UserRound size={12} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.assignee?.name ?? "Sem responsavel"}</span>
          </span>
        )}
        <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
      </div>
    </Link>
  );
}

function CriticalRow({ item }: { item: Critical }) {
  const color = item.tone === "red" ? "var(--red)" : "var(--amber)";
  return (
    <Link href={item.href} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 56, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <AlertTriangle size={14} style={{ color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 540, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{item.subtitle}</p>
        </div>
      </div>
    </Link>
  );
}

function RiskClientRow({ client }: { client: { id: string; name: string; reason: string; tone: string } }) {
  const color = client.tone === "red" ? "var(--red)" : client.tone === "amber" ? "var(--amber)" : "var(--blue)";
  return (
    <Link href={`/clients/${client.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 52, padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
        <Avatar name={client.name} size="sm" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 540, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.name}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {client.reason}
          </p>
        </div>
        <ShieldAlert size={13} style={{ color }} />
      </div>
    </Link>
  );
}

function TodaySkeleton() {
  return (
    <div style={{ flex: 1, padding: 32, background: "var(--bg-base)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="skeleton-surface" style={{ height: 128, borderRadius: "var(--radius-panel)" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1.45fr 0.8fr", gap: 22 }}>
        <div className="skeleton-surface" style={{ height: 360, borderRadius: "var(--radius-panel)" }} />
        <div className="skeleton-surface" style={{ height: 360, borderRadius: "var(--radius-panel)" }} />
      </div>
    </div>
  );
}
