import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

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

  // Receita do mês — recorrentes consideram o status POR MÊS (override), não o base.
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const [avulsoPaid, avulsoPend, recReceitas] = await Promise.all([
    prisma.financeEntry.aggregate({
      where: { deletedAt: null, type: "RECEITA", status: "PAGO", mode: "AVULSO", date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { value: true },
    }),
    prisma.financeEntry.aggregate({
      where: { deletedAt: null, type: "RECEITA", status: "PENDENTE", mode: "AVULSO", date: { gte: startOfMonth, lte: endOfMonth } },
      _sum: { value: true },
    }),
    prisma.financeEntry.findMany({
      where: { deletedAt: null, type: "RECEITA", mode: "RECORRENTE" },
      select: { id: true, value: true, status: true },
    }),
  ]);
  const recOverrides = await prisma.financeStatusOverride.findMany({
    where: { year: curYear, month: curMonth, refKey: { in: recReceitas.map(r => `rec-${r.id}`) } },
  });
  const recOvMap = new Map(recOverrides.map(o => [o.refKey, o.status as string]));
  let recPaid = 0, recPend = 0;
  for (const r of recReceitas) {
    const st = recOvMap.get(`rec-${r.id}`) ?? r.status;
    if (st === "PAGO") recPaid += r.value;
    else if (st === "PENDENTE") recPend += r.value;
  }
  const receitaPagaValue     = (avulsoPaid._sum.value ?? 0) + recPaid;
  const receitaPendenteValue = (avulsoPend._sum.value ?? 0) + recPend;

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
    },
    clientStats,
    overdueDetails,
    suggestions,
  });
}
