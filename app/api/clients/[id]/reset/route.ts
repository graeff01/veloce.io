import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { buildTasksFromPlanItems, createTasksWithChecklists } from "@/lib/plan-generator";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:create");
  if (error) return error;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activePlan = await (prisma.clientPlan as any).findFirst({
    where: { clientId: id, active: true },
    orderBy: { appliedAt: "desc" },
  });

  if (!activePlan) {
    return NextResponse.json({ error: "Nenhum plano ativo encontrado" }, { status: 404 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: activePlan.planId },
    include: { items: true },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  }

  // Soft-delete ALL tasks for this client
  await prisma.task.updateMany({
    where: { clientId: id, deletedAt: null },
    data: { deletedAt: now },
  });

  // Regenerate current month from active plan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTasks = buildTasksFromPlanItems(id, currentMonth, currentYear, plan.items as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = await createTasksWithChecklists(rawTasks, plan.items as any);

  await (prisma.clientPlan as any).update({
    where: { id: activePlan.id },
    data: { month: currentMonth, year: currentYear },
  });

  await logAction(session!.user.id, "RESET_CLIENT", id, undefined, {
    tasksCreated: tasks.length,
    month: currentMonth,
    year: currentYear,
  });

  return NextResponse.json({ tasks, month: currentMonth, year: currentYear }, { status: 201 });
}
