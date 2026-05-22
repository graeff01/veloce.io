import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()));

  // All tasks for this client in the given month/year, ordered
  const tasks = await prisma.task.findMany({
    where: {
      clientId: id,
      deletedAt: null,
      planMonth: month,
      planYear: year,
    },
    include: {
      checklists: { orderBy: { order: "asc" } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ type: "asc" }, { dueDate: "asc" }, { order: "asc" }],
  });

  // Also fetch tasks without planMonth/planYear but with dueDate in this month
  // (manually created tasks that aren't part of a plan)
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  const unplanedTasks = await prisma.task.findMany({
    where: {
      clientId: id,
      deletedAt: null,
      planMonth: null,
      dueDate: { gte: monthStart, lte: monthEnd },
    },
    include: {
      checklists: { orderBy: { order: "asc" } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }],
  });

  const allTasks = [...tasks, ...unplanedTasks];

  // Group by type
  const byType: Record<string, {
    type: string;
    tasks: typeof allTasks;
    total: number;
    done: number;
    overdue: number;
  }> = {};

  for (const task of allTasks) {
    const key = task.type ?? "Outros";
    if (!byType[key]) {
      byType[key] = { type: key, tasks: [], total: 0, done: 0, overdue: 0 };
    }
    byType[key].tasks.push(task);
    byType[key].total++;
    if (task.status === "DONE") byType[key].done++;
    if (task.status !== "DONE" && task.dueDate < now) byType[key].overdue++;
  }

  // Active plan for the month (for planned quantities)
  const activePlan = await prisma.clientPlan.findFirst({
    where: { clientId: id, active: true },
    include: { plan: { include: { items: true } } },
    orderBy: { appliedAt: "desc" },
  });

  const plannedQty: Record<string, number> = {};
  if (activePlan) {
    for (const item of activePlan.plan.items) {
      plannedQty[item.type] = item.quantity;
    }
  }

  const groups = Object.values(byType).map((g) => ({
    ...g,
    planned: plannedQty[g.type] ?? g.total,
    pct: g.total > 0 ? Math.round((g.done / (plannedQty[g.type] ?? g.total)) * 100) : 0,
  }));

  return NextResponse.json({
    month,
    year,
    groups,
    summary: {
      total: allTasks.length,
      done: allTasks.filter((t) => t.status === "DONE").length,
      overdue: allTasks.filter((t) => t.status !== "DONE" && t.dueDate < now).length,
      hasPlan: !!activePlan,
      planName: activePlan?.plan.name ?? null,
    },
  });
}
