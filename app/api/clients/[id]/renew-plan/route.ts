import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { buildTasksFromPlanItems, createTasksWithChecklists } from "@/lib/plan-generator";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:create");
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const month: number = body.month ?? now.getMonth() + 1;
  const year: number = body.year ?? now.getFullYear();

  const activePlan = await prisma.clientPlan.findFirst({
    where: { clientId: id, active: true },
    orderBy: { appliedAt: "desc" },
    include: { plan: { include: { items: true } } },
  });

  if (!activePlan) {
    return NextResponse.json({ error: "Nenhum plano ativo encontrado" }, { status: 404 });
  }

  // Check for existing tasks this month
  const existing = await prisma.task.count({
    where: { clientId: id, deletedAt: null, planMonth: month, planYear: year },
  });

  if (existing > 0) {
    return NextResponse.json(
      { error: "Tasks já existem para este mês", existing },
      { status: 409 }
    );
  }

  const rawTasks = buildTasksFromPlanItems(id, month, year, activePlan.plan.items);
  const tasks = await createTasksWithChecklists(rawTasks, activePlan.plan.items);

  await prisma.clientPlan.update({
    where: { id: activePlan.id },
    data: { month, year },
  });

  await logAction(session!.user.id, "RENEW_PLAN", id, undefined, {
    planId: activePlan.plan.id,
    planName: activePlan.plan.name,
    month,
    year,
    tasksCreated: tasks.length,
  });

  return NextResponse.json({ tasks, month, year }, { status: 201 });
}
