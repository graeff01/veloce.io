"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, AlertTriangle, CheckCircle2, Clock,
  TrendingDown, Activity, Zap, ArrowRight,
  BellRing, ChevronRight
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, isOverdue } from "@/lib/utils";

interface DashboardData {
  summary: {
    activeClients: number;
    dueTodayTasks: number;
    overdueTasks: number;
    completedThisMonth: number;
  };
  clientStats: Array<{
    id: string;
    name: string;
    status: string;
    stats: {
      monthTasks: number;
      doneTasks: number;
      overdue: number;
      completionRate: number;
      daysSinceActivity: number;
      inactive: boolean;
    };
  }>;
  overdueDetails: Array<{
    id: string;
    title: string;
    dueDate: string;
    client: { id: string; name: string };
    assignee: { name: string } | null;
  }>;
  suggestions: Array<{
    type: string;
    message: string;
    clientId?: string;
    clientName?: string;
  }>;
}

export function DashboardContent({ userName }: { userName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d ?? {
        summary: { activeClients: 0, dueTodayTasks: 0, overdueTasks: 0, completedThisMonth: 0 },
        clientStats: [],
        overdueDetails: [],
        suggestions: [],
      }))
      .catch(() => setData({
        summary: { activeClients: 0, dueTodayTasks: 0, overdueTasks: 0, completedThisMonth: 0 },
        clientStats: [],
        overdueDetails: [],
        suggestions: [],
      }))
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = userName.split(" ")[0];

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading) return <LoadingSkeleton />;
  if (!data) return null;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      {/* Page header */}
      <div
        style={{
          padding: "28px 32px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 4,
          }}
        >
          {greeting}, {firstName}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "capitalize" }}>
          {today}
        </p>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Metric blocks */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <MetricBlock
            label="Clientes ativos"
            value={data.summary.activeClients}
            icon={Users}
            accentColor="var(--blue)"
          />
          <MetricBlock
            label="Entregam hoje"
            value={data.summary.dueTodayTasks}
            icon={Clock}
            accentColor="var(--amber)"
            alert={data.summary.dueTodayTasks > 0}
          />
          <MetricBlock
            label="Em atraso"
            value={data.summary.overdueTasks}
            icon={AlertTriangle}
            accentColor="var(--red)"
            alert={data.summary.overdueTasks > 0}
          />
          <MetricBlock
            label="Concluídas no mês"
            value={data.summary.completedThisMonth}
            icon={CheckCircle2}
            accentColor="var(--green)"
          />
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
          {/* Left — Client health rows */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <h2
                style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}
              >
                Saúde dos Clientes
              </h2>
              <Link
                href="/clients"
                style={{
                  fontSize: 12,
                  color: "var(--accent)",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Ver todos <ArrowRight size={11} />
              </Link>
            </div>

            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                boxShadow: "var(--shadow-card)",
                overflow: "hidden",
              }}
            >
              {data.clientStats.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  <Users size={32} style={{ margin: "0 auto 8px", opacity: 0.25 }} />
                  <p style={{ fontSize: 13 }}>Nenhum cliente cadastrado ainda</p>
                  <Link
                    href="/clients/new"
                    style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
                  >
                    Adicionar cliente →
                  </Link>
                </div>
              ) : (
                data.clientStats.map((client, i) => (
                  <ClientHealthRow
                    key={client.id}
                    client={client}
                    last={i === data.clientStats.length - 1}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right — Alerts panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.suggestions.length > 0 && (
              <AlertsPanel
                title="Sugestões Operacionais"
                icon={<Zap size={13} color="var(--accent)" />}
              >
                {data.suggestions.slice(0, 4).map((s, i) => (
                  <SuggestionRow key={i} suggestion={s} />
                ))}
              </AlertsPanel>
            )}

            {data.overdueDetails.length > 0 && (
              <AlertsPanel
                title="Tarefas em Atraso"
                icon={<BellRing size={13} color="var(--red)" />}
                count={data.overdueDetails.length}
              >
                {data.overdueDetails.slice(0, 6).map((task) => (
                  <OverdueRow key={task.id} task={task} />
                ))}
              </AlertsPanel>
            )}

            {data.suggestions.length === 0 && data.overdueDetails.length === 0 && (
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  boxShadow: "var(--shadow-card)",
                  padding: "32px 20px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "center",
                }}
              >
                <Activity size={24} color="var(--green)" style={{ opacity: 0.4 }} />
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                  Operação saudável
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Nenhum alerta no momento
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  icon: Icon,
  accentColor,
  alert,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accentColor: string;
  alert?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${alert && value > 0 ? accentColor + "55" : "var(--border)"}`,
        borderRadius: 10,
        padding: "18px 20px",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "box-shadow 150ms ease-out",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: accentColor + "18",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={15} color={accentColor} />
      </div>
      <div>
        <p
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          {value}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</p>
      </div>
    </div>
  );
}

function ClientHealthRow({
  client,
  last,
}: {
  client: DashboardData["clientStats"][0];
  last: boolean;
}) {
  const { stats } = client;
  const health =
    stats.overdue > 2 ? "critical" : stats.overdue > 0 || stats.inactive ? "warning" : "good";
  const healthColor = {
    critical: "var(--red)",
    warning: "var(--amber)",
    good: "var(--green)",
  }[health];

  return (
    <Link href={`/clients/${client.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: last ? "none" : "1px solid var(--border)",
          transition: "background 150ms ease-out",
          cursor: "pointer",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "transparent")
        }
      >
        {/* Avatar */}
        <Avatar name={client.name} size="sm" />

        {/* Name */}
        <div style={{ width: 140, flexShrink: 0 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {client.name}
          </p>
          {stats.inactive && (
            <p style={{ fontSize: 11, color: "var(--amber)" }}>
              {stats.daysSinceActivity}d sem atividade
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ flex: 1, padding: "0 8px" }}>
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
                width: `${stats.completionRate}%`,
                height: "100%",
                background: healthColor,
                borderRadius: 2,
                transition: "width 300ms ease-out",
              }}
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            {stats.doneTasks}/{stats.monthTasks} concluídas
          </p>
        </div>

        {/* Overdue badge */}
        <div style={{ width: 80, textAlign: "right", flexShrink: 0 }}>
          {stats.overdue > 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--red)",
                background: "var(--red-soft)",
                padding: "2px 8px",
                borderRadius: 20,
              }}
            >
              <AlertTriangle size={9} />
              {stats.overdue} atraso
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: "var(--green)",
                background: "var(--green-soft)",
                padding: "2px 8px",
                borderRadius: 20,
              }}
            >
              OK
            </span>
          )}
        </div>

        {/* Status dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: healthColor,
            flexShrink: 0,
          }}
        />
      </div>
    </Link>
  );
}

function AlertsPanel({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
          {title}
        </span>
        {count !== undefined && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--red)",
              background: "var(--red-soft)",
              padding: "1px 7px",
              borderRadius: 20,
            }}
          >
            {count}
          </span>
        )}
      </div>
      <div style={{ padding: "8px 0" }}>{children}</div>
    </div>
  );
}

function SuggestionRow({ suggestion }: { suggestion: DashboardData["suggestions"][0] }) {
  const typeConfig = {
    overdue: { color: "var(--red)", icon: AlertTriangle },
    inactive: { color: "var(--amber)", icon: Clock },
    behind: { color: "var(--amber)", icon: TrendingDown },
  }[suggestion.type] ?? { color: "var(--blue)", icon: Activity };

  const Icon = typeConfig.icon;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 16px",
        borderLeft: `3px solid ${typeConfig.color}`,
        marginBottom: 4,
      }}
    >
      <Icon size={11} color={typeConfig.color} style={{ marginTop: 2, flexShrink: 0 }} />
      <p style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1, lineHeight: "18px" }}>
        {suggestion.message}
      </p>
      {suggestion.clientId && (
        <Link href={`/clients/${suggestion.clientId}`} style={{ flexShrink: 0 }}>
          <ChevronRight size={11} color="var(--text-muted)" />
        </Link>
      )}
    </div>
  );
}

function OverdueRow({ task }: { task: DashboardData["overdueDetails"][0] }) {
  return (
    <Link href={`/clients/${task.client.id}/tasks`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 16px",
          transition: "background 150ms ease-out",
          cursor: "pointer",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background = "transparent")
        }
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--red)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {task.title}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {task.client.name} · {formatDate(task.dueDate)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ flex: 1, padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ height: 48, borderRadius: 8, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 100,
              borderRadius: 10,
              background: "var(--bg-surface)",
              animation: "pulse 1.5s infinite",
            }}
          />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div style={{ height: 280, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 280, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      </div>
    </div>
  );
}
