"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, AlertTriangle, CheckCircle2, CalendarDays,
  ArrowRight, ChevronRight, Mic, ListChecks, Sparkles, ShieldCheck,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

interface Commitment { id: string; title: string; clientId: string; clientName: string; }
interface DashboardData {
  summary: {
    activeClients: number; dueTodayTasks: number; overdueTasks: number;
    completedThisMonth: number; allMonthTasks: number; taxaConclusao: number;
    // financeiro (existe na API, mas NÃO é exibido na home — vive no módulo Finanças)
    [k: string]: number;
  };
  commitments?: { meetings: Array<Commitment & { time: string }>; tasks: Array<Commitment & { priority: string }> };
  alerts?: Array<{ type: string; severity: "high" | "warn" | "info"; message: string; href?: string }>;
  clientStats: Array<{
    id: string; name: string; logoUrl?: string | null; status: string;
    stats: { monthTasks: number; doneTasks: number; overdue: number; completionRate: number; daysSinceActivity: number; inactive: boolean; receitaMes: number; sangria?: boolean; adReprovado?: boolean; semResposta?: number };
  }>;
  overdueDetails: Array<{ id: string; title: string; dueDate: string; client: { id: string; name: string }; assignee: { name: string } | null }>;
  suggestions: Array<{ type: string; message: string; clientId?: string; clientName?: string }>;
}

const EMPTY: DashboardData = {
  summary: { activeClients: 0, dueTodayTasks: 0, overdueTasks: 0, completedThisMonth: 0, allMonthTasks: 0, taxaConclusao: 0 },
  commitments: { meetings: [], tasks: [] }, alerts: [], clientStats: [], overdueDetails: [], suggestions: [],
};

export function DashboardContent({ userName }: { userName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d ?? EMPTY))
      .catch(() => setData(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = userName.split(" ")[0];
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  if (loading) return <LoadingSkeleton />;
  if (!data) return null;

  const s = data.summary;
  const clients = data.clientStats;
  const attn = clients.filter((c) => { const f = clientFlags(c.stats); return f.hard || f.soft; }).length;
  const ok = clients.length - attn;
  const pending = Math.max(0, s.allMonthTasks - s.completedThisMonth);
  const commitCount = (data.commitments?.meetings.length ?? 0) + (data.commitments?.tasks.length ?? 0);
  const alerts = (data.alerts ?? []).filter((a) => a.type !== "margin"); // home é operação, não financeiro

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ padding: "28px 36px 44px", display: "flex", flexDirection: "column", gap: 22 }}>

        {/* ── Header + resumo da operação ── */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
            {greeting}, {firstName}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, textTransform: "capitalize" }}>{today}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", marginTop: 14 }}>
            <Status ok={s.overdueTasks === 0} label={s.overdueTasks === 0 ? "Nenhum atraso registrado" : `${s.overdueTasks} tarefa${s.overdueTasks > 1 ? "s" : ""} em atraso`} />
            <Status ok={alerts.length === 0} label={alerts.length === 0 ? "Nenhum alerta pendente" : `${alerts.length} alerta${alerts.length > 1 ? "s" : ""} pendente${alerts.length > 1 ? "s" : ""}`} />
            <Status neutral icon={<CalendarDays size={14} />} label={commitCount === 0 ? "Nenhum compromisso hoje" : `${commitCount} compromisso${commitCount > 1 ? "s" : ""} hoje`} />
            <Status neutral icon={<Users size={14} />} label={`${s.activeClients} cliente${s.activeClients !== 1 ? "s" : ""} ativo${s.activeClients !== 1 ? "s" : ""}`} />
          </div>
        </div>

        {/* ── KPIs operacionais (um painel segmentado) ── */}
        <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          <Kpi value={String(s.activeClients)} label="Clientes ativos" />
          <Kpi value={String(attn)} label="Em atenção" tone={attn > 0 ? "var(--amber)" : undefined} divider />
          <Kpi value={String(pending)} label="Tarefas pendentes" divider />
          <Kpi value={String(s.dueTodayTasks)} label="Entregas hoje" tone={s.dueTodayTasks > 0 ? "var(--amber)" : undefined} divider />
          <Kpi value={String(s.overdueTasks)} label="Em atraso" tone={s.overdueTasks > 0 ? "var(--red)" : undefined} divider />
          <Kpi value={`${s.taxaConclusao}%`} label="Conclusão do mês"
            tone={s.taxaConclusao >= 70 ? "var(--green)" : s.taxaConclusao >= 40 ? "var(--amber)" : "var(--red)"} divider />
        </section>

        {/* ── Saúde dos clientes (protagonista) + rail de insights ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.1fr) minmax(300px, 1fr)", gap: 20, alignItems: "start" }}>
          <ClientHealth clients={clients} ok={ok} attn={attn} />
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <InsightsPanel clients={clients} alerts={alerts} dueToday={s.dueTodayTasks} okPct={clients.length ? Math.round((ok / clients.length) * 100) : 0} />
            <TodayPanel commitments={data.commitments} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Resumo (status narrativo) ─────────────────────────── */
function Status({ ok, neutral, icon, label }: { ok?: boolean; neutral?: boolean; icon?: React.ReactNode; label: string }) {
  const color = neutral ? "var(--text-muted)" : ok ? "var(--green)" : "var(--amber)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-secondary)" }}>
      <span style={{ color, display: "flex" }}>{icon ?? (ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />)}</span>
      {label}
    </span>
  );
}

/* ─── KPI ───────────────────────────────────────────────── */
function Kpi({ value, label, tone, divider }: { value: string; label: string; tone?: string; divider?: boolean }) {
  return (
    <div style={{ padding: "18px 22px", borderLeft: divider ? "1px solid var(--border)" : "none" }}>
      <p style={{ ...num, fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: tone ?? "var(--text-primary)" }}>{value}</p>
      <p style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", marginTop: 7 }}>{label}</p>
    </div>
  );
}

/* ─── Saúde dos Clientes ───────────────────────────────── */
// Saúde 360°: entrega (tarefas) + resultado (anúncio) + atendimento (WhatsApp).
function clientFlags(s: DashboardData["clientStats"][0]["stats"]) {
  const semResp = s.semResposta ?? 0;
  const hard = s.overdue > 2 || !!s.sangria || !!s.adReprovado || semResp >= 3;
  const soft = s.overdue > 0 || s.inactive || semResp > 0;
  return { hard, soft };
}
function riskRank(c: DashboardData["clientStats"][0]) {
  const f = clientFlags(c.stats);
  return f.hard ? 0 : f.soft ? 1 : 2;
}

function ClientHealth({ clients, ok, attn }: { clients: DashboardData["clientStats"]; ok: number; attn: number }) {
  const sorted = [...clients].sort((a, b) => riskRank(a) - riskRank(b) || b.stats.overdue - a.stats.overdue);
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <SectionLabel icon={<ShieldCheck size={13} />}>Saúde dos Clientes</SectionLabel>
          {clients.length > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              <span style={{ color: "var(--green)" }}>{ok} saudáve{ok === 1 ? "l" : "is"}</span>
              {attn > 0 && <> · <span style={{ color: "var(--amber)" }}>{attn} em atenção</span></>}
            </span>
          )}
        </div>
        <Link href="/clients" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          Ver todos <ArrowRight size={11} />
        </Link>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        {clients.length === 0
          ? <Empty icon={<Users size={28} />} text="Carteira pronta para a primeira conta" />
          : sorted.map((c, i) => <ClientRow key={c.id} client={c} last={i === sorted.length - 1} />)}
      </div>
    </section>
  );
}

function ClientRow({ client, last }: { client: DashboardData["clientStats"][0]; last: boolean }) {
  const { stats } = client;
  const f = clientFlags(stats);
  const health = f.hard ? "var(--red)" : f.soft ? "var(--amber)" : "var(--green)";
  return (
    <Link href={`/clients/${client.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: last ? "none" : "1px solid var(--border)", transition: "background 120ms" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: health, flexShrink: 0 }} />
        <Avatar name={client.name} src={client.logoUrl} size="sm" />
        <div style={{ width: 180, flexShrink: 0, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "18px" }}>{client.name}</p>
          <p style={{ fontSize: 11, color: stats.inactive ? "var(--amber)" : "var(--text-muted)", lineHeight: "15px" }}>
            {stats.inactive ? `${stats.daysSinceActivity}d sem atividade` : "ativo recentemente"}
          </p>
        </div>
        <div style={{ flex: 1, padding: "0 10px", minWidth: 90 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
            <span style={{ ...num, fontSize: 11.5, color: "var(--text-muted)" }}>{stats.doneTasks}/{stats.monthTasks} concluídas</span>
            <span style={{ ...num, fontSize: 12, fontWeight: 700, color: health }}>{stats.completionRate}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ width: `${stats.completionRate}%`, height: "100%", background: health, borderRadius: 3, transition: "width 450ms ease-out" }} />
          </div>
        </div>
        <div style={{ width: 104, textAlign: "right", flexShrink: 0 }}>
          {(() => {
            const semResp = stats.semResposta ?? 0;
            const b = stats.adReprovado ? { t: "anúncio ⚠", c: "red" as const }
              : stats.sangria ? { t: "sangria", c: "red" as const }
              : semResp >= 1 ? { t: `${semResp} s/ resp`, c: (semResp >= 3 ? "red" : "amber") as "red" | "amber" }
              : stats.overdue > 0 ? { t: `${stats.overdue} atraso${stats.overdue > 1 ? "s" : ""}`, c: "red" as const }
              : stats.inactive ? { t: "Inativo", c: "amber" as const }
              : { t: "Saudável", c: "green" as const };
            const col = b.c === "red" ? "var(--red)" : b.c === "amber" ? "var(--amber)" : "var(--green)";
            const bg = b.c === "red" ? "var(--red-soft)" : b.c === "amber" ? "var(--amber-soft)" : "var(--green-soft)";
            return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: col, background: bg, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>{b.c === "red" && <AlertTriangle size={9} />}{b.t}</span>;
          })()}
        </div>
      </div>
    </Link>
  );
}

/* ─── Insights da Operação ─────────────────────────────── */
function InsightsPanel({ clients, alerts, dueToday, okPct }: {
  clients: DashboardData["clientStats"]; alerts: NonNullable<DashboardData["alerts"]>; dueToday: number; okPct: number;
}) {
  const items: { tone: "good" | "warn" | "high" | "info"; text: string; href?: string }[] = [];
  if (clients.length > 0)
    items.push({ tone: okPct >= 70 ? "good" : "warn", text: `${okPct}% dos clientes estão saudáveis` });
  for (const a of alerts) items.push({ tone: a.severity === "high" ? "high" : a.severity === "warn" ? "warn" : "info", text: a.message, href: a.href });
  if (dueToday === 0) items.push({ tone: "info", text: "Nenhuma entrega programada para hoje" });

  const dot = (t: string) => (t === "good" ? "var(--green)" : t === "high" ? "var(--red)" : t === "warn" ? "var(--amber)" : "var(--accent)");
  const soft = (t: string) => (t === "good" ? "var(--green-soft)" : t === "high" ? "var(--red-soft)" : t === "warn" ? "var(--amber-soft)" : "var(--accent-soft)");

  return (
    <section>
      <SectionLabel icon={<Sparkles size={12} />}>Insights da operação</SectionLabel>
      <div style={{ marginTop: 12, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        {items.length === 0 ? (
          <Empty icon={<CheckCircle2 size={22} style={{ color: "var(--green)" }} />} text="Operação saudável" />
        ) : items.map((it, i) => {
          const inner = (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none", transition: "background 120ms" }}
              onMouseEnter={(e) => { if (it.href) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot(it.tone), marginTop: 5, flexShrink: 0, boxShadow: `0 0 0 3px ${soft(it.tone)}` }} />
              <span style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.45 }}>{it.text}</span>
            </div>
          );
          return it.href ? <Link key={i} href={it.href} style={{ textDecoration: "none" }}>{inner}</Link> : <div key={i}>{inner}</div>;
        })}
      </div>
    </section>
  );
}

/* ─── Hoje (compromissos) ──────────────────────────────── */
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

function TodayPanel({ commitments }: { commitments?: DashboardData["commitments"] }) {
  const meetings = commitments?.meetings ?? [];
  const tasks = commitments?.tasks ?? [];
  const empty = meetings.length === 0 && tasks.length === 0;
  return (
    <section>
      <SectionLabel icon={<CalendarDays size={12} />}>Hoje</SectionLabel>
      <div style={{ marginTop: 12, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        {empty ? (
          <Empty icon={<CalendarDays size={22} />} text="Nada agendado para hoje" />
        ) : (
          <>
            {meetings.map((m, i) => (
              <CommitRow key={m.id} href={`/clients/${m.clientId}`} divider={i < meetings.length - 1 || tasks.length > 0}
                icon={<Mic size={13} color="var(--accent)" />} bg="var(--accent-soft)" title={m.title} sub={`${fmtTime(m.time)}${m.clientName ? ` · ${m.clientName}` : ""}`} />
            ))}
            {tasks.map((t, i) => (
              <CommitRow key={t.id} href={`/clients/${t.clientId}`} divider={i < tasks.length - 1}
                icon={<ListChecks size={13} color="var(--amber)" />} bg="var(--amber-soft)" title={t.title} sub={`Entrega hoje${t.clientName ? ` · ${t.clientName}` : ""}`} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function CommitRow({ href, icon, bg, title, sub, divider }: { href: string; icon: React.ReactNode; bg: string; title: string; sub: string; divider: boolean }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", borderBottom: divider ? "1px solid var(--border)" : "none", transition: "background 120ms" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{sub}</p>
        </div>
        <ChevronRight size={14} color="var(--text-muted)" />
      </div>
    </Link>
  );
}

/* ─── Helpers ──────────────────────────────────────────── */
function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
      {icon}{children}
    </h2>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <span style={{ opacity: 0.25 }}>{icon}</span>
      <p style={{ fontSize: 13 }}>{text}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ flex: 1, padding: "28px 36px", display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ height: 70, width: 320, borderRadius: 8, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ height: 88, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "2.1fr 1fr", gap: 20 }}>
        <div style={{ height: 360, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 360, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      </div>
    </div>
  );
}
