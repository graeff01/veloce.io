import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";
import { buildTasksFromPlanItems, createTasksWithChecklists } from "@/lib/plan-generator";

const schema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { month, year } = parsed.data;
  const now = new Date();

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

  // Soft-delete all tasks for this month
  await prisma.task.updateMany({
    where: { clientId: id, planMonth: month, planYear: year, deletedAt: null },
    data: { deletedAt: now },
  });

  // Regenerate from active plan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTasks = buildTasksFromPlanItems(id, month, year, plan.items as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = await createTasksWithChecklists(rawTasks, plan.items as any);

  return NextResponse.json({ tasks, month, year }, { status: 201 });
}
