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
    receitaMes,
    receitaPendente,
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
    // receita paga este mês (avulso + recorrente)
    prisma.financeEntry.aggregate({
      where: {
        deletedAt: null, type: "RECEITA", status: "PAGO",
        OR: [
          { mode: "AVULSO",     date: { gte: startOfMonth, lte: endOfMonth } },
          { mode: "RECORRENTE" },
        ],
      },
      _sum: { value: true },
    }),
    // receita pendente este mês
    prisma.financeEntry.aggregate({
      where: {
        deletedAt: null, type: "RECEITA", status: "PENDENTE",
        OR: [
          { mode: "AVULSO",     date: { gte: startOfMonth, lte: endOfMonth } },
          { mode: "RECORRENTE" },
        ],
      },
      _sum: { value: true },
    }),
  ]);

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
      receitaMes:      receitaMes._sum.value      ?? 0,
      receitaPendente: receitaPendente._sum.value ?? 0,
    },
    clientStats,
    overdueDetails,
    suggestions,
  });
}
