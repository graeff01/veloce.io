"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, AlertTriangle, CheckCircle2, Clock,
  TrendingDown, TrendingUp, ArrowRight,
  BellRing, ChevronRight, Mic, ListChecks, CalendarDays, Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

function fmtBRL(v: number) {
  if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(1).replace(".", ",")}k`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

interface Commitment { id: string; title: string; clientId: string; clientName: string; }
interface DashboardData {
  summary: {
    activeClients: number; dueTodayTasks: number; overdueTasks: number;
    completedThisMonth: number; allMonthTasks: number; taxaConclusao: number;
    receitaMes: number; receitaPendente: number; lucroMes: number; despesasMes: number;
    custosEquipe: number; margem: number; aReceber: number; aPagar: number;
    receitaPrev: number; lucroPrev: number;
  };
  commitments?: { meetings: Array<Commitment & { time: string }>; tasks: Array<Commitment & { priority: string }> };
  alerts?: Array<{ type: string; severity: "high" | "warn" | "info"; message: string; href?: string }>;
  clientStats: Array<{
    id: string; name: string; logoUrl?: string | null; status: string;
    stats: { monthTasks: number; doneTasks: number; overdue: number; completionRate: number; daysSinceActivity: number; inactive: boolean; receitaMes: number };
  }>;
  overdueDetails: Array<{ id: string; title: string; dueDate: string; client: { id: string; name: string }; assignee: { name: string } | null }>;
  suggestions: Array<{ type: string; message: string; clientId?: string; clientName?: string }>;
}

const EMPTY: DashboardData = {
  summary: { activeClients: 0, dueTodayTasks: 0, overdueTasks: 0, completedThisMonth: 0, allMonthTasks: 0, taxaConclusao: 0, receitaMes: 0, receitaPendente: 0, lucroMes: 0, despesasMes: 0, custosEquipe: 0, margem: 0, aReceber: 0, aPagar: 0, receitaPrev: 0, lucroPrev: 0 },
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
  const delta = s.lucroPrev !== 0 ? Math.round(((s.lucroMes - s.lucroPrev) / Math.abs(s.lucroPrev)) * 100) : null;

  // Resumo executivo: síntese inteligente só com dados existentes.
  const summaryBits: string[] = [`Margem ${s.margem}%`];
  if (delta !== null) summaryBits.push(`lucro ${delta >= 0 ? "+" : ""}${delta}% vs. mês passado`);
  summaryBits.push(s.overdueTasks > 0 ? `${s.overdueTasks} em atraso` : "sem atrasos");
  if (s.dueTodayTasks > 0) summaryBits.push(`${s.dueTodayTasks} entrega${s.dueTodayTasks > 1 ? "s" : ""} hoje`);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 32px 40px", display: "flex", flexDirection: "column", gap: 22 }}>

        {/* ── Header + resumo executivo ── */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
            {greeting}, {firstName}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5 }}>
            <span style={{ textTransform: "capitalize" }}>{today}</span>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>·</span>
            {summaryBits.join(" · ")}
          </p>
        </div>

        {/* ── Hero financeiro ── */}
        <FinanceHero s={s} delta={delta} />

        {/* ── Operação (um painel) ── */}
        <OpsPanel s={s} />

        {/* ── Hoje · Atenção ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 18 }}>
          <TodayPanel commitments={data.commitments} />
          <AttentionPanel alerts={data.alerts ?? []} />
        </div>

        {/* ── Saúde dos clientes ── */}
        <ClientHealth clients={data.clientStats} />
      </div>
    </div>
  );
}

/* ─── Finance Hero ─────────────────────────────────────── */
function FinanceHero({ s, delta }: { s: DashboardData["summary"]; delta: number | null }) {
  const pos = s.lucroMes >= 0;
  const up = (delta ?? 0) >= 0;
  return (
    <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 1.7fr", gap: 0 }}>
        {/* Primário: lucro */}
        <div style={{ padding: "24px 28px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.07em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 7 }}>
            <Wallet size={13} style={{ color: pos ? "var(--green)" : "var(--red)" }} /> Lucro do mês
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ ...num, fontSize: 40, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: pos ? "var(--text-primary)" : "var(--red)" }}>{fmtBRL(s.lucroMes)}</span>
            {delta !== null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 700, color: up ? "var(--green)" : "var(--red)" }}>
                {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{Math.abs(delta)}%
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
            Margem <strong style={{ color: "var(--text-secondary)" }}>{s.margem}%</strong>
            <span style={{ margin: "0 7px", opacity: 0.5 }}>·</span>
            mês passado {fmtBRL(s.lucroPrev)}
          </p>
        </div>

        {/* Secundário agrupado */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderLeft: "1px solid var(--border)" }}>
          <SubStat label="Receita" value={fmtBRL(s.receitaMes)} tone="var(--green)" />
          <SubStat label="Despesas" value={fmtBRL(s.despesasMes)} tone="var(--text-primary)" hint={s.custosEquipe > 0 ? `Equipe ${fmtBRL(s.custosEquipe)}` : undefined} divider />
          <SubStat label="A receber" value={fmtBRL(s.aReceber)} tone="var(--amber)" divider />
          <SubStat label="A pagar" value={fmtBRL(s.aPagar)} tone="var(--amber)" divider />
        </div>
      </div>
    </section>
  );
}

function SubStat({ label, value, tone, hint, divider }: { label: string; value: string; tone: string; hint?: string; divider?: boolean }) {
  return (
    <div style={{ padding: "24px 20px", borderLeft: divider ? "1px solid var(--border)" : "none", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 7 }}>{label}</p>
      <p style={{ ...num, fontSize: 19, fontWeight: 700, color: tone, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</p>
      {hint && <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 5 }}>{hint}</p>}
    </div>
  );
}

/* ─── Operação ─────────────────────────────────────────── */
function OpsPanel({ s }: { s: DashboardData["summary"] }) {
  const taxaColor = s.taxaConclusao >= 70 ? "var(--green)" : s.taxaConclusao >= 40 ? "var(--amber)" : "var(--red)";
  return (
    <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr" }}>
      <OpsSeg icon={<Clock size={14} color="var(--amber)" />} value={String(s.dueTodayTasks)} label="Entregam hoje"
        sub={s.dueTodayTasks > 0 ? "requer atenção" : "sem entregas"} tone={s.dueTodayTasks > 0 ? "var(--amber)" : undefined} />
      <OpsSeg icon={<AlertTriangle size={14} color="var(--red)" />} value={String(s.overdueTasks)} label="Em atraso"
        sub={s.overdueTasks > 0 ? "tarefas vencidas" : "nenhum atraso"} tone={s.overdueTasks > 0 ? "var(--red)" : undefined} divider />
      <div style={{ padding: "18px 24px", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Conclusão do mês</span>
          <span style={{ ...num, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: taxaColor }}>{s.taxaConclusao}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: "var(--bg-elevated)", overflow: "hidden" }}>
          <div style={{ width: `${s.taxaConclusao}%`, height: "100%", background: taxaColor, borderRadius: 3, transition: "width 500ms ease-out" }} />
        </div>
        <p style={{ ...num, fontSize: 11, color: "var(--text-muted)", marginTop: 7 }}>{s.completedThisMonth}/{s.allMonthTasks} tarefas · {s.activeClients} clientes ativos</p>
      </div>
    </section>
  );
}

function OpsSeg({ icon, value, label, sub, tone, divider }: { icon: React.ReactNode; value: string; label: string; sub: string; tone?: string; divider?: boolean }) {
  return (
    <div style={{ padding: "18px 24px", borderLeft: divider ? "1px solid var(--border)" : "none", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <div>
        <p style={{ ...num, fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: tone ?? "var(--text-primary)" }}>{value}</p>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginTop: 4 }}>{label}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{sub}</p>
      </div>
    </div>
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
      <SectionLabel>Hoje</SectionLabel>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden", minHeight: 96 }}>
        {empty ? (
          <Empty icon={<CalendarDays size={22} />} text="Nada agendado para hoje" />
        ) : (
          <>
            {meetings.map((m, i) => (
              <Row key={m.id} href={`/clients/${m.clientId}`} divider={i < meetings.length - 1 || tasks.length > 0}
                icon={<Mic size={13} color="var(--accent)" />} iconBg="var(--accent-soft)"
                title={m.title} sub={`${fmtTime(m.time)}${m.clientName ? ` · ${m.clientName}` : ""}`} />
            ))}
            {tasks.map((t, i) => (
              <Row key={t.id} href={`/clients/${t.clientId}`} divider={i < tasks.length - 1}
                icon={<ListChecks size={13} color="var(--amber)" />} iconBg="var(--amber-soft)"
                title={t.title} sub={`Entrega hoje${t.clientName ? ` · ${t.clientName}` : ""}`} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function Row({ href, icon, iconBg, title, sub, divider }: { href: string; icon: React.ReactNode; iconBg: string; title: string; sub: string; divider: boolean }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", borderBottom: divider ? "1px solid var(--border)" : "none", transition: "background 120ms" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{sub}</p>
        </div>
        <ChevronRight size={14} color="var(--text-muted)" />
      </div>
    </Link>
  );
}

/* ─── Atenção (alertas) ────────────────────────────────── */
function AttentionPanel({ alerts }: { alerts: NonNullable<DashboardData["alerts"]> }) {
  const color = (s: string) => (s === "high" ? "var(--red)" : s === "warn" ? "var(--amber)" : "var(--accent)");
  const soft = (s: string) => (s === "high" ? "var(--red-soft)" : s === "warn" ? "var(--amber-soft)" : "var(--accent-soft)");
  return (
    <section>
      <SectionLabel icon={<BellRing size={12} />}>Precisa de atenção</SectionLabel>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden", minHeight: 96 }}>
        {alerts.length === 0 ? (
          <Empty icon={<CheckCircle2 size={22} style={{ color: "var(--green)" }} />} text="Tudo sob controle" />
        ) : alerts.map((a, i) => {
          const inner = (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderBottom: i < alerts.length - 1 ? "1px solid var(--border)" : "none", transition: "background 120ms" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: color(a.severity), marginTop: 5, flexShrink: 0, boxShadow: `0 0 0 3px ${soft(a.severity)}` }} />
              <span style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.45 }}>{a.message}</span>
            </div>
          );
          return a.href ? <Link key={i} href={a.href} style={{ textDecoration: "none" }}>{inner}</Link> : <div key={i}>{inner}</div>;
        })}
      </div>
    </section>
  );
}

/* ─── Saúde dos Clientes ───────────────────────────────── */
function ClientHealth({ clients }: { clients: DashboardData["clientStats"] }) {
  const ok = clients.filter((c) => c.stats.overdue === 0 && !c.stats.inactive).length;
  const attn = clients.length - ok;
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <SectionLabel>Saúde dos Clientes</SectionLabel>
          {clients.length > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              {clients.length} {clients.length === 1 ? "cliente" : "clientes"} · <span style={{ color: "var(--green)" }}>{ok} OK</span>
              {attn > 0 && <> · <span style={{ color: "var(--amber)" }}>{attn} atenção</span></>}
            </span>
          )}
        </div>
        <Link href="/clients" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          Ver todos <ArrowRight size={11} />
        </Link>
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
        {clients.length === 0 ? (
          <Empty icon={<Users size={28} />} text="Carteira pronta para a primeira conta" />
        ) : clients.map((client, i) => (
          <ClientRow key={client.id} client={client} last={i === clients.length - 1} />
        ))}
      </div>
    </section>
  );
}

function ClientRow({ client, last }: { client: DashboardData["clientStats"][0]; last: boolean }) {
  const { stats } = client;
  const health = stats.overdue > 2 ? "var(--red)" : stats.overdue > 0 || stats.inactive ? "var(--amber)" : "var(--green)";
  return (
    <Link href={`/clients/${client.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", borderBottom: last ? "none" : "1px solid var(--border)", transition: "background 120ms" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: health, flexShrink: 0 }} />
        <Avatar name={client.name} src={client.logoUrl} size="sm" />
        <div style={{ width: 160, flexShrink: 0, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "18px" }}>{client.name}</p>
          {stats.inactive && <p style={{ fontSize: 11, color: "var(--amber)", lineHeight: "15px" }}>{stats.daysSinceActivity}d sem atividade</p>}
        </div>
        <div style={{ flex: 1, padding: "0 8px", minWidth: 80 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
            <span style={{ ...num, fontSize: 11, color: "var(--text-muted)" }}>{stats.doneTasks}/{stats.monthTasks} concluídas</span>
            <span style={{ ...num, fontSize: 11, fontWeight: 700, color: health }}>{stats.completionRate}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ width: `${stats.completionRate}%`, height: "100%", background: health, borderRadius: 2, transition: "width 400ms ease-out" }} />
          </div>
        </div>
        <div style={{ width: 80, textAlign: "right", flexShrink: 0 }}>
          {stats.receitaMes > 0
            ? <span style={{ ...num, fontSize: 12.5, fontWeight: 700, color: "var(--green)" }}>{fmtBRL(stats.receitaMes)}</span>
            : <span style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.5 }}>—</span>}
        </div>
        <div style={{ width: 60, textAlign: "right", flexShrink: 0 }}>
          {stats.overdue > 0
            ? <span style={{ ...num, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "var(--red)", background: "var(--red-soft)", padding: "2px 8px", borderRadius: 20 }}><AlertTriangle size={8} />{stats.overdue}</span>
            : <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", background: "var(--green-soft)", padding: "2px 8px", borderRadius: 20 }}>OK</span>}
        </div>
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
    <div style={{ flex: 1, maxWidth: 1320, margin: "0 auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ height: 52, width: 280, borderRadius: 8, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ height: 130, borderRadius: 16, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ height: 96, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 18 }}>
        <div style={{ height: 180, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 180, borderRadius: 14, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
      </div>
    </div>
  );
}
