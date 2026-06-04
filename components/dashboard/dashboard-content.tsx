"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, AlertTriangle, CheckCircle2, Clock,
  TrendingDown, TrendingUp, Activity, Zap, ArrowRight,
  BellRing, ChevronRight, Mic, ListChecks,
  CalendarDays, Settings, Wallet, Brain,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";

function fmtBRL(v: number) {
  if (v >= 1000) return `R$${(v / 1000).toFixed(1).replace(".", ",")}k`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Commitment { id: string; title: string; clientId: string; clientName: string; }
interface DashboardData {
  summary: {
    activeClients: number;
    dueTodayTasks: number;
    overdueTasks: number;
    completedThisMonth: number;
    allMonthTasks: number;
    taxaConclusao: number;
    receitaMes: number;
    receitaPendente: number;
    lucroMes: number;
    despesasMes: number;
    custosEquipe: number;
    margem: number;
    aReceber: number;
    aPagar: number;
    receitaPrev: number;
    lucroPrev: number;
  };
  commitments?: {
    meetings: Array<Commitment & { time: string }>;
    tasks: Array<Commitment & { priority: string }>;
  };
  alerts?: Array<{ type: string; severity: "high" | "warn" | "info"; message: string; href?: string }>;
  clientStats: Array<{
    id: string;
    name: string;
    logoUrl?: string | null;
    status: string;
    stats: {
      monthTasks: number;
      doneTasks: number;
      overdue: number;
      completionRate: number;
      daysSinceActivity: number;
      inactive: boolean;
      receitaMes: number;
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

const EMPTY: DashboardData = {
  summary: { activeClients: 0, dueTodayTasks: 0, overdueTasks: 0, completedThisMonth: 0, allMonthTasks: 0, taxaConclusao: 0, receitaMes: 0, receitaPendente: 0, lucroMes: 0, despesasMes: 0, custosEquipe: 0, margem: 0, aReceber: 0, aPagar: 0, receitaPrev: 0, lucroPrev: 0 },
  commitments: { meetings: [], tasks: [] }, alerts: [],
  clientStats: [], overdueDetails: [], suggestions: [],
};

export function DashboardContent({ userName }: { userName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d ?? EMPTY))
      .catch(() => setData(EMPTY))
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
      {/* ── Page header ────────────────────────────────── */}
      <div
        style={{
          padding: "24px 32px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 3,
          }}
        >
          {greeting}, {firstName}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "capitalize" }}>
          {today}
        </p>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── Quick nav ──────────────────────────────── */}
        <QuickNav />

        {/* ── Faixa financeira (o número que importa) ── */}
        <FinanceHero s={data.summary} />

        {/* ── KPIs operacionais (suporte) ────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <MetricBlock
            label="Entregam hoje"
            value={String(data.summary.dueTodayTasks)}
            sub={data.summary.dueTodayTasks > 0 ? "requer atenção agora" : "Sem entregas hoje"}
            icon={Clock}
            accentColor="var(--amber)"
            softColor="var(--amber-soft)"
            alert={data.summary.dueTodayTasks > 0}
          />
          <MetricBlock
            label="Em atraso"
            value={String(data.summary.overdueTasks)}
            sub={data.summary.overdueTasks > 0 ? "tarefas vencidas" : "Nenhum atraso"}
            icon={AlertTriangle}
            accentColor="var(--red)"
            softColor="var(--red-soft)"
            alert={data.summary.overdueTasks > 0}
          />
          <MetricBlock
            label="Taxa de conclusão"
            value={`${data.summary.taxaConclusao}%`}
            sub={`${data.summary.completedThisMonth}/${data.summary.allMonthTasks} tarefas no mês`}
            icon={CheckCircle2}
            accentColor={data.summary.taxaConclusao >= 70 ? "var(--green)" : data.summary.taxaConclusao >= 40 ? "var(--amber)" : "var(--red)"}
            softColor={data.summary.taxaConclusao >= 70 ? "var(--green-soft)" : data.summary.taxaConclusao >= 40 ? "var(--amber-soft)" : "var(--red-soft)"}
          />
        </div>

        {/* ── Compromissos de hoje + Alertas ─────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
          <CommitmentsPanel commitments={data.commitments} />
          <AlertsPanel alerts={data.alerts ?? []} />
        </div>

        {/* ── Saúde dos clientes ─────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>

          {/* Client health */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
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
                  <Users size={32} style={{ margin: "0 auto 8px", opacity: 0.2 }} />
                  <p style={{ fontSize: 13, marginBottom: 6 }}>Carteira pronta para a primeira conta</p>
                  <Link
                    href="/clients"
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
        </div>
      </div>
    </div>
  );
}

/* ─── Finance Hero ───────────────────────────────────── */

function FinanceHero({ s }: { s: DashboardData["summary"] }) {
  const lucroPos = s.lucroMes >= 0;
  const delta = s.lucroPrev !== 0 ? Math.round(((s.lucroMes - s.lucroPrev) / Math.abs(s.lucroPrev)) * 100) : null;
  const up = (delta ?? 0) >= 0;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", padding: "20px 24px", display: "grid", gridTemplateColumns: "1.1fr 2fr", gap: 24, alignItems: "center" }}>
      <div style={{ borderRight: "1px solid var(--border)", paddingRight: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <Wallet size={14} style={{ color: lucroPos ? "var(--green)" : "var(--red)" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Lucro do mês</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: lucroPos ? "var(--green)" : "var(--red)", lineHeight: 1 }}>{fmtBRL(s.lucroMes)}</span>
          {delta !== null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: up ? "var(--green)" : "var(--red)" }}>
              {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(delta)}%
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
          Margem {s.margem}% · mês passado {fmtBRL(s.lucroPrev)}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <SubStat label="Receita" value={fmtBRL(s.receitaMes)} color="var(--green)" />
        <SubStat label="Despesas" value={fmtBRL(s.despesasMes)} color="var(--red)" hint={s.custosEquipe > 0 ? `Equipe ${fmtBRL(s.custosEquipe)}` : undefined} />
        <SubStat label="A receber" value={fmtBRL(s.aReceber)} color="var(--amber)" />
        <SubStat label="A pagar" value={fmtBRL(s.aPagar)} color="var(--amber)" />
      </div>
    </div>
  );
}

function SubStat({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</p>
      {hint && <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, opacity: 0.8 }}>{hint}</p>}
    </div>
  );
}

/* ─── Commitments ────────────────────────────────────── */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function CommitmentsPanel({ commitments }: { commitments?: DashboardData["commitments"] }) {
  const meetings = commitments?.meetings ?? [];
  const tasks = commitments?.tasks ?? [];
  const empty = meetings.length === 0 && tasks.length === 0;
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Compromissos de hoje</h2>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        {empty ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <CalendarDays size={28} style={{ margin: "0 auto 8px", opacity: 0.2 }} />
            <p style={{ fontSize: 13 }}>Nada agendado para hoje</p>
          </div>
        ) : (
          <>
            {meetings.map((m, i) => (
              <Link key={m.id} href={`/clients/${m.clientId}`} style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: (i < meetings.length - 1 || tasks.length > 0) ? "1px solid var(--border)" : "none" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Mic size={13} color="var(--accent)" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{fmtTime(m.time)}{m.clientName ? ` · ${m.clientName}` : ""}</p>
                  </div>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </div>
              </Link>
            ))}
            {tasks.map((t, i) => (
              <Link key={t.id} href={`/clients/${t.clientId}`} style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: i < tasks.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--amber-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ListChecks size={13} color="var(--amber)" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Entrega hoje{t.clientName ? ` · ${t.clientName}` : ""}</p>
                  </div>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Alerts ─────────────────────────────────────────── */

function AlertsPanel({ alerts }: { alerts: NonNullable<DashboardData["alerts"]> }) {
  const color = (s: string) => s === "high" ? "var(--red)" : s === "warn" ? "var(--amber)" : "var(--accent)";
  const soft  = (s: string) => s === "high" ? "var(--red-soft)" : s === "warn" ? "var(--amber-soft)" : "var(--accent-soft)";
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <BellRing size={13} /> Alertas
      </h2>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        {alerts.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <CheckCircle2 size={28} style={{ margin: "0 auto 8px", opacity: 0.25, color: "var(--green)" }} />
            <p style={{ fontSize: 13 }}>Tudo sob controle</p>
          </div>
        ) : alerts.map((a, i) => {
          const inner = (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 14px", borderBottom: i < alerts.length - 1 ? "1px solid var(--border)" : "none" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: color(a.severity), marginTop: 5, flexShrink: 0, boxShadow: `0 0 0 3px ${soft(a.severity)}` }} />
              <span style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.4 }}>{a.message}</span>
            </div>
          );
          return a.href
            ? <Link key={i} href={a.href} style={{ textDecoration: "none" }}>{inner}</Link>
            : <div key={i}>{inner}</div>;
        })}
      </div>
    </div>
  );
}

/* ─── Quick Nav ──────────────────────────────────────── */

const NAV_ITEMS = [
  {
    href: "/clients",
    label: "Clientes",
    description: "Carteira e setup",
    icon: Users,
    color: "#4F46E5",
    soft: "rgba(79,70,229,0.08)",
  },
  {
    href: "/calendar",
    label: "Calendário",
    description: "Tarefas e agenda",
    icon: CalendarDays,
    color: "#0891B2",
    soft: "rgba(8,145,178,0.08)",
  },
  {
    href: "/finances",
    label: "Finanças",
    description: "Receitas e despesas",
    icon: Wallet,
    color: "#059669",
    soft: "rgba(5,150,105,0.08)",
  },
  {
    href: "/hr",
    label: "Equipe",
    description: "Pessoas e custos",
    icon: Users,
    color: "#D97706",
    soft: "rgba(217,119,6,0.08)",
  },
  {
    href: "/intelligence",
    label: "Inteligência",
    description: "Campanhas e insights",
    icon: Brain,
    color: "#7C3AED",
    soft: "rgba(124,58,237,0.08)",
  },
  {
    href: "/settings",
    label: "Configurações",
    description: "Time e permissões",
    icon: Settings,
    color: "#475569",
    soft: "rgba(71,85,105,0.08)",
  },
] as const;

function QuickNav() {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, opacity: 0.7 }}>
        Acesso rápido
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <QuickNavCard item={item} Icon={Icon} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function QuickNavCard({
  item,
  Icon,
}: {
  item: typeof NAV_ITEMS[number];
  Icon: React.ElementType;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? item.soft : "var(--bg-surface)",
        border: `1px solid ${hover ? item.color + "33" : "var(--border)"}`,
        borderRadius: 12,
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        cursor: "pointer",
        transition: "background 140ms ease, border-color 140ms ease, transform 140ms ease",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hover ? `0 4px 16px ${item.color}18` : "none",
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: item.soft,
        border: `1px solid ${item.color}22`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 140ms ease",
      }}>
        <Icon size={16} style={{ color: item.color }} />
      </div>
      <div>
        <p style={{ fontSize: 12.5, fontWeight: 650, color: "var(--text-primary)", lineHeight: 1, marginBottom: 3 }}>
          {item.label}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
          {item.description}
        </p>
      </div>
    </div>
  );
}

/* ─── Metric Block ───────────────────────────────────── */
function MetricBlock({
  label,
  value,
  sub,
  icon: Icon,
  accentColor,
  softColor,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accentColor: string;
  softColor: string;
  alert?: boolean;
}) {
  const isAlert = alert && value !== "0";
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${isAlert ? accentColor + "44" : "var(--border)"}`,
        borderLeft: isAlert ? `3px solid ${accentColor}` : `3px solid transparent`,
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transition: "box-shadow 150ms ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: softColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} style={{ color: accentColor }} />
        </div>
        {isAlert && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: accentColor, animation: "pulse 2s ease infinite" }} />
        )}
      </div>
      <div>
        <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", color: isAlert ? accentColor : "var(--text-primary)", lineHeight: 1, marginBottom: 3 }}>
          {value}
        </p>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", lineHeight: 1.3 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, opacity: 0.8 }}>{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Client Health Row ──────────────────────────────── */
function ClientHealthRow({
  client,
  last,
}: {
  client: DashboardData["clientStats"][0];
  last: boolean;
}) {
  const { stats } = client;
  const health =
    stats.overdue > 2 ? "critical"
    : stats.overdue > 0 || stats.inactive ? "warning"
    : "good";
  const healthColor = {
    critical: "var(--red)",
    warning:  "var(--amber)",
    good:     "var(--green)",
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
        <Avatar name={client.name} src={client.logoUrl} size="sm" />

        {/* Name + inactivity note */}
        <div style={{ width: 140, flexShrink: 0 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: "18px",
            }}
          >
            {client.name}
          </p>
          {stats.inactive && (
            <p style={{ fontSize: 11, color: "var(--amber)", lineHeight: "15px" }}>
              {stats.daysSinceActivity}d sem atividade
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ flex: 1, padding: "0 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {stats.doneTasks}/{stats.monthTasks} concluídas
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: healthColor }}>
              {stats.completionRate}%
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ width: `${stats.completionRate}%`, height: "100%", background: healthColor, borderRadius: 2, transition: "width 400ms ease-out" }} />
          </div>
        </div>

        {/* Receita */}
        <div style={{ width: 72, textAlign: "right", flexShrink: 0 }}>
          {stats.receitaMes > 0 ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>
              {fmtBRL(stats.receitaMes)}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.5 }}>—</span>
          )}
        </div>

        {/* Status badge */}
        <div style={{ width: 72, textAlign: "right", flexShrink: 0 }}>
          {stats.overdue > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "var(--red)", background: "var(--red-soft)", padding: "2px 7px", borderRadius: 20 }}>
              <AlertTriangle size={8} />
              {stats.overdue}
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--green)", background: "var(--green-soft)", padding: "2px 7px", borderRadius: 20 }}>
              OK
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ─── Radar Panel ────────────────────────────────────── */
function RadarPanel({
  suggestions,
  overdueDetails,
}: {
  suggestions: DashboardData["suggestions"];
  overdueDetails: DashboardData["overdueDetails"];
}) {
  const typeConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    overdue:  { color: "var(--red)",   icon: AlertTriangle, label: "Atraso"     },
    inactive: { color: "var(--amber)", icon: Clock,         label: "Inativo"    },
    behind:   { color: "var(--amber)", icon: TrendingDown,  label: "Lento"      },
  };

  const hasAlerts = suggestions.length > 0 || overdueDetails.length > 0;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
        <Zap size={13} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>Radar operacional</span>
        {hasAlerts && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", background: "var(--red-soft)", padding: "1px 7px", borderRadius: 20 }}>
            {suggestions.length + (overdueDetails.length > 0 ? 1 : 0)}
          </span>
        )}
      </div>

      {!hasAlerts ? (
        <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
          <Activity size={22} style={{ color: "var(--green)", opacity: 0.35 }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Operação saudável</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhum alerta no momento</p>
        </div>
      ) : (
        <div style={{ padding: "8px 0" }}>

          {/* Suggestions */}
          {suggestions.slice(0, 4).map((s, i) => {
            const cfg = typeConfig[s.type] ?? { color: "var(--blue)", icon: Activity, label: "Alerta" };
            const Icon = cfg.icon;
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: cfg.color + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <Icon size={11} style={{ color: cfg.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: "17px", margin: 0 }}>{s.message}</p>
                </div>
                {s.clientId && (
                  <Link href={`/clients/${s.clientId}`} style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                    <ChevronRight size={12} style={{ color: "var(--text-muted)" }} />
                  </Link>
                )}
              </div>
            );
          })}

          {/* Overdue tasks — grouped label */}
          {overdueDetails.length > 0 && (
            <>
              <div style={{ padding: "7px 16px 4px", display: "flex", alignItems: "center", gap: 6 }}>
                <BellRing size={10} style={{ color: "var(--red)" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {overdueDetails.length} tarefa{overdueDetails.length !== 1 ? "s" : ""} vencida{overdueDetails.length !== 1 ? "s" : ""}
                </span>
              </div>
              {overdueDetails.slice(0, 5).map((task) => (
                <Link key={task.id} href={`/clients/${task.client.id}`} style={{ textDecoration: "none", display: "block" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", transition: "background 120ms" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-elevated)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0, lineHeight: "16px" }}>{task.title}</p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: "14px" }}>{task.client.name} · {formatDate(task.dueDate)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Loading Skeleton ───────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div style={{ flex: 1, padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ height: 60, borderRadius: 8, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{ height: 108, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }}
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
