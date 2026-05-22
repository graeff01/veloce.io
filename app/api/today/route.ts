import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function GET() {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const [dueToday, overdue, blocked, activeClients] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null, dueDate: { gte: today, lt: tomorrow }, status: { not: "DONE" } },
      include: { client: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: "asc" }, { order: "asc" }],
      take: 20,
    }),
    prisma.task.findMany({
      where: { deletedAt: null, dueDate: { lt: today }, status: { not: "DONE" } },
      include: { client: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    prisma.task.findMany({
      where: { deletedAt: null, status: { not: "DONE" }, blocker: { not: null } },
      include: { client: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 20,
    }),
    prisma.client.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const clientsWithoutActivity = await Promise.all(
    activeClients.map(async (client) => {
      const lastLog = await prisma.executionLog.findFirst({
        where: { clientId: client.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      const daysSinceActivity = lastLog
        ? Math.floor((now.getTime() - lastLog.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return { ...client, daysSinceActivity };
    })
  );

  const inactiveClients = clientsWithoutActivity
    .filter((client) => client.daysSinceActivity >= 4 || client.daysSinceActivity === 999)
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)
    .slice(0, 12);

  const clientsWithoutFutureTasks = await Promise.all(
    activeClients.map(async (client) => {
      const futureTasks = await prisma.task.count({
        where: { clientId: client.id, deletedAt: null, status: { not: "DONE" }, dueDate: { gte: today } },
      });
      return { ...client, futureTasks };
    })
  );

  const noFutureClients = clientsWithoutFutureTasks
    .filter((client) => client.futureTasks === 0)
    .slice(0, 12);

  const urgentTasks = [...overdue, ...dueToday, ...blocked]
    .filter((task, index, arr) => arr.findIndex((item) => item.id === task.id) === index)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 10);

  const criticals = [
    ...overdue.slice(0, 5).map((task) => ({
      id: `overdue-${task.id}`,
      tone: "red",
      title: task.title,
      subtitle: `${task.client.name} esta em atraso`,
      href: `/clients/${task.clientId}/tasks`,
    })),
    ...inactiveClients.slice(0, 4).map((client) => ({
      id: `inactive-${client.id}`,
      tone: "amber",
      title: client.name,
      subtitle: client.daysSinceActivity === 999
        ? "Sem atividade registrada"
        : `${client.daysSinceActivity} dias sem atividade`,
      href: `/clients/${client.id}`,
    })),
  ].slice(0, 8);

  // Clients with active autoRenew plan but no tasks this month
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const autoRenewPlans = await prisma.clientPlan.findMany({
    where: { active: true, autoRenew: true },
    select: { clientId: true, plan: { select: { name: true } } },
  });

  const clientsWithoutTasksThisMonth = (
    await Promise.all(
      autoRenewPlans.map(async (cp) => {
        const count = await prisma.task.count({
          where: { clientId: cp.clientId, deletedAt: null, planMonth: currentMonth, planYear: currentYear },
        });
        if (count > 0) return null;
        const client = activeClients.find((c) => c.id === cp.clientId);
        if (!client) return null;
        return { ...client, planName: cp.plan.name };
      })
    )
  ).filter(Boolean) as Array<{ id: string; name: string; planName: string }>;

  return NextResponse.json({
    summary: {
      dueToday: dueToday.length,
      overdue: overdue.length,
      blocked: blocked.length,
      inactiveClients: inactiveClients.length,
      noFutureClients: noFutureClients.length,
      criticals: criticals.length,
      missingTasksClients: clientsWithoutTasksThisMonth.length,
    },
    dueToday,
    overdue,
    blocked,
    inactiveClients,
    noFutureClients,
    clientsWithoutTasksThisMonth,
    priorityTasks: urgentTasks,
    urgentTasks,
    criticals,
    generatedAt: now,
  });
}

function priorityRank(priority: string) {
  return { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[priority as "CRITICAL" | "HIGH" | "NORMAL" | "LOW"] ?? 2;
}
