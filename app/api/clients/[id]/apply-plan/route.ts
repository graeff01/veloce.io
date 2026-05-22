import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";
import { buildTasksFromPlanItems, createTasksWithChecklists } from "@/lib/plan-generator";

const applyPlanSchema = z.object({
  planId: z.string().min(1),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
  autoRenew: z.boolean().default(false),
  renewDay: z.number().min(1).max(28).default(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:create");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = applyPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: parsed.data.planId, deletedAt: null },
    include: { items: true },
  });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });

  // Deactivate any previous active ClientPlan for this client
  await prisma.clientPlan.updateMany({
    where: { clientId: id, active: true },
    data: { active: false },
  });

  const clientPlan = await prisma.clientPlan.create({
    data: {
      clientId: id,
      planId: parsed.data.planId,
      month: parsed.data.month,
      year: parsed.data.year,
      appliedBy: session!.user.id,
      autoRenew: parsed.data.autoRenew,
      renewDay: parsed.data.renewDay,
      active: true,
    },
  });

  await prisma.client.update({
    where: { id },
    data: { activePlanId: parsed.data.planId },
  });

  // Build and create tasks automatically — no manual dates
  const rawTasks = buildTasksFromPlanItems(
    id,
    parsed.data.month,
    parsed.data.year,
    plan.items
  );

  const tasks = await createTasksWithChecklists(rawTasks, plan.items);

  await logAction(session!.user.id, "APPLY_PLAN", id, undefined, {
    planId: plan.id,
    planName: plan.name,
    month: parsed.data.month,
    year: parsed.data.year,
    autoRenew: parsed.data.autoRenew,
    tasksCreated: tasks.length,
  });

  return NextResponse.json({ clientPlan, tasks }, { status: 201 });
}
