import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// Receita e despesa de um mês, resolvendo o status POR MÊS dos recorrentes.
async function financeForMonth(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  const pend = { in: ["PENDENTE", "VENCIDO"] as ("PENDENTE" | "VENCIDO")[] };
  const [avRpaid, avRpend, avDpaid, avDpend, recR, recD] = await Promise.all([
    prisma.financeEntry.aggregate({ where: { deletedAt: null, type: "RECEITA", status: "PAGO", mode: "AVULSO", date: { gte: start, lte: end } }, _sum: { value: true } }),
    prisma.financeEntry.aggregate({ where: { deletedAt: null, type: "RECEITA", status: pend, mode: "AVULSO", date: { gte: start, lte: end } }, _sum: { value: true } }),
    prisma.financeEntry.aggregate({ where: { deletedAt: null, type: "DESPESA", status: "PAGO", mode: "AVULSO", date: { gte: start, lte: end } }, _sum: { value: true } }),
    prisma.financeEntry.aggregate({ where: { deletedAt: null, type: "DESPESA", status: pend, mode: "AVULSO", date: { gte: start, lte: end } }, _sum: { value: true } }),
    prisma.financeEntry.findMany({ where: { deletedAt: null, type: "RECEITA", mode: "RECORRENTE" }, select: { id: true, value: true, status: true } }),
    prisma.financeEntry.findMany({ where: { deletedAt: null, type: "DESPESA", mode: "RECORRENTE" }, select: { id: true, value: true, status: true } }),
  ]);
  const ids = [...recR, ...recD].map((r) => `rec-${r.id}`);
  const overrides = ids.length
    ? await prisma.financeStatusOverride.findMany({ where: { year, month, refKey: { in: ids } } })
    : [];
  const ov = new Map(overrides.map((o) => [o.refKey, o.status as string]));
  const sum = (rows: { id: string; value: number; status: string }[], paid: boolean) =>
    rows.reduce((s, r) => {
      const st = ov.get(`rec-${r.id}`) ?? r.status;
      const isPaid = st === "PAGO";
      return paid === isPaid ? s + r.value : s;
    }, 0);
  return {
    receitaPaga: (avRpaid._sum?.value ?? 0) + sum(recR, true),
    receitaPend: (avRpend._sum?.value ?? 0) + sum(recR, false),
    despesaPaga: (avDpaid._sum?.value ?? 0) + sum(recD, true),
    despesaPend: (avDpend._sum?.value ?? 0) + sum(recD, false),
  };
}

export async function GET() {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    activeClients,
    dueTodayTasks,
    overdueTasks,
    completedThisMonth,
    allMonthTasks,
  ] = await Promise.all([
    prisma.client.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.task.count({
      where: { deletedAt: null, dueDate: { gte: today, lt: tomorrow }, status: { not: "DONE" } },
    }),
    prisma.task.count({
      where: { deletedAt: null, dueDate: { lt: today }, status: { not: "DONE" } },
    }),
    prisma.task.count({
      where: { deletedAt: null, status: "DONE", updatedAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.task.count({
      where: { deletedAt: null, dueDate: { gte: startOfMonth, lte: endOfMonth } },
    }),
  ]);

  // ── Financeiro: lucro real (receita − despesas − folha) + tendência ──────────
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const prevDate = new Date(curYear, curMonth - 2, 1);
  const prevMonth = prevDate.getMonth() + 1;
  const prevYear  = prevDate.getFullYear();

  const [fin, finPrev, activeTeam] = await Promise.all([
    financeForMonth(curYear, curMonth),
    financeForMonth(prevYear, prevMonth),
    prisma.teamMember.findMany({ where: { deletedAt: null, status: "ATIVO" }, select: { salary: true } }),
  ]);

  // Folha fixa mensal (salários ativos). Prestadores variáveis dependem da
  // quantidade do mês (definida na tela) e não entram aqui.
  const custosEquipe = activeTeam.reduce((s, m) => s + (m.salary ?? 0), 0);

  const receitaPagaValue     = fin.receitaPaga;
  const receitaPendenteValue = fin.receitaPend;
  const despesasMes          = fin.despesaPaga + custosEquipe;
  const lucroMes             = receitaPagaValue - despesasMes;
  const margem               = receitaPagaValue > 0 ? Math.round((lucroMes / receitaPagaValue) * 100) : 0;
  const aReceber             = fin.receitaPend;
  const aPagar               = fin.despesaPend;

  const lucroPrev   = finPrev.receitaPaga - (finPrev.despesaPaga + custosEquipe);
  const receitaPrev = finPrev.receitaPaga;

  // Client health stats
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true, status: true, activePlanId: true, logoUrl: true },
  });

  const clientStats = await Promise.all(
    clients.map(async (client) => {
      const [monthTasks, doneTasks, overdue, lastLog, receitaCliente] = await Promise.all([
        prisma.task.count({
          where: { clientId: client.id, deletedAt: null, dueDate: { gte: startOfMonth, lte: endOfMonth } },
        }),
        prisma.task.count({
          where: { clientId: client.id, deletedAt: null, status: "DONE", dueDate: { gte: startOfMonth, lte: endOfMonth } },
        }),
        prisma.task.count({
          where: { clientId: client.id, deletedAt: null, dueDate: { lt: today }, status: { not: "DONE" } },
        }),
        prisma.executionLog.findFirst({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.financeEntry.aggregate({
          where: {
            clientId: client.id, deletedAt: null, type: "RECEITA",
            OR: [
              { mode: "AVULSO",     date: { gte: startOfMonth, lte: endOfMonth } },
              { mode: "RECORRENTE" },
            ],
          },
          _sum: { value: true },
        }),
      ]);

      const daysSinceActivity = lastLog
        ? Math.floor((now.getTime() - lastLog.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        ...client,
        stats: {
          monthTasks,
          doneTasks,
          overdue,
          completionRate: monthTasks > 0 ? Math.round((doneTasks / monthTasks) * 100) : 0,
          daysSinceActivity,
          inactive: daysSinceActivity >= 7,
          receitaMes: receitaCliente._sum.value ?? 0,
        },
      };
    })
  );

  // Overdue tasks details grouped by client
  const overdueDetails = await prisma.task.findMany({
    where: { deletedAt: null, dueDate: { lt: today }, status: { not: "DONE" } },
    include: {
      client: { select: { id: true, name: true } },
      assignee: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 20,
  });

  // Intelligence suggestions
  const suggestions: { type: string; message: string; clientId?: string; clientName?: string }[] = [];

  for (const client of clientStats) {
    if (client.stats.overdue >= 3) {
      suggestions.push({
        type: "overdue",
        message: `${client.name} tem ${client.stats.overdue} tarefas em atraso`,
        clientId: client.id,
        clientName: client.name,
      });
    }
    if (client.stats.daysSinceActivity >= 7) {
      suggestions.push({
        type: "inactive",
        message: `${client.name} não teve atividade há ${client.stats.daysSinceActivity} dias`,
        clientId: client.id,
        clientName: client.name,
      });
    }
    if (client.stats.monthTasks > 0 && client.stats.completionRate < 40) {
      suggestions.push({
        type: "behind",
        message: `Execução de ${client.name} está ${client.stats.completionRate}% abaixo do esperado`,
        clientId: client.id,
        clientName: client.name,
      });
    }
  }

  const taxaConclusao = allMonthTasks > 0
    ? Math.round((completedThisMonth / allMonthTasks) * 100)
    : 0;

  // ── Compromissos de hoje + alertas proativos ─────────────────────────────────
  const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);
  const in3days  = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [meetingsToday, tasksToday, meetingsTomorrow, billsDueSoon, followUps] = await Promise.all([
    prisma.meeting.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      select: { id: true, title: true, date: true, clientId: true, client: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({
      where: { deletedAt: null, dueDate: { gte: today, lt: tomorrow }, status: { not: "DONE" } },
      select: { id: true, title: true, clientId: true, priority: true, client: { select: { name: true } } },
      orderBy: [{ priority: "asc" }],
      take: 10,
    }),
    prisma.meeting.findMany({
      where: { date: { gte: tomorrow, lt: dayAfter } },
      select: { id: true, title: true, clientId: true, client: { select: { name: true } } },
    }),
    prisma.financeEntry.findMany({
      where: { deletedAt: null, status: { in: ["PENDENTE", "VENCIDO"] }, date: { lte: in3days } },
      select: { id: true, description: true, value: true, date: true, type: true },
      orderBy: { date: "asc" }, take: 10,
    }),
    prisma.client.findMany({
      where: { deletedAt: null, status: "ACTIVE", followUpAt: { not: null, lte: tomorrow } },
      select: { id: true, name: true, followUpAt: true, followUpNote: true },
      orderBy: { followUpAt: "asc" }, take: 10,
    }),
  ]);

  const commitments = {
    meetings: meetingsToday.map((m) => ({ id: m.id, title: m.title, clientId: m.clientId, clientName: m.client?.name ?? "", time: m.date })),
    tasks: tasksToday.map((t) => ({ id: t.id, title: t.title, clientId: t.clientId, clientName: t.client?.name ?? "", priority: t.priority })),
  };

  const alerts: { type: string; severity: "high" | "warn" | "info"; message: string; href?: string }[] = [];
  if (overdueTasks > 0)
    alerts.push({ type: "overdue", severity: "high", message: `${overdueTasks} tarefa(s) em atraso`, href: "/calendar" });
  for (const m of meetingsTomorrow)
    alerts.push({ type: "meeting", severity: "info", message: `Reunião amanhã: ${m.title}${m.client?.name ? ` · ${m.client.name}` : ""}`, href: m.clientId ? `/clients/${m.clientId}` : "/calendar" });
  for (const b of billsDueSoon) {
    const venc = b.date < today;
    alerts.push({
      type: "bill",
      severity: venc ? "high" : "warn",
      message: `${b.type === "RECEITA" ? "A receber" : "A pagar"}${venc ? " vencido" : " vencendo"}: ${b.description}`,
      href: "/finances",
    });
  }
  for (const c of clientStats) {
    if (c.stats.daysSinceActivity >= 7 && c.stats.daysSinceActivity < 999)
      alerts.push({ type: "inactive", severity: "warn", message: `${c.name} há ${c.stats.daysSinceActivity} dias sem atividade`, href: `/clients/${c.id}` });
  }
  if (lucroPrev > 0 && lucroMes < lucroPrev * 0.8)
    alerts.push({ type: "margin", severity: "warn", message: `Lucro ${Math.round((1 - lucroMes / lucroPrev) * 100)}% abaixo do mês passado`, href: "/finances" });
  for (const c of followUps) {
    const overdue = c.followUpAt ? c.followUpAt < today : false;
    alerts.push({
      type: "followup",
      severity: overdue ? "high" : "info",
      message: `Follow-up: ${c.name}${c.followUpNote ? ` — ${c.followUpNote}` : ""}`,
      href: `/clients/${c.id}`,
    });
  }

  const sevRank = { high: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return NextResponse.json({
    summary: {
      activeClients,
      dueTodayTasks,
      overdueTasks,
      completedThisMonth,
      allMonthTasks,
      taxaConclusao,
      receitaMes:      receitaPagaValue,
      receitaPendente: receitaPendenteValue,
      // financeiro do dono
      lucroMes,
      despesasMes,
      custosEquipe,
      margem,
      aReceber,
      aPagar,
      receitaPrev,
      lucroPrev,
    },
    commitments,
    alerts: alerts.slice(0, 6),
    clientStats,
    overdueDetails,
    suggestions,
  });
}
