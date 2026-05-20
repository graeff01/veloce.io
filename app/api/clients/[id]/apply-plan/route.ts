import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const applyPlanSchema = z.object({
  planId: z.string().min(1),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
  tasks: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      dueDate: z.string(),
      assignedTo: z.string().optional(),
    })
  ),
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

  const plan = await prisma.plan.findFirst({ where: { id: parsed.data.planId, deletedAt: null } });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });

  const clientPlan = await prisma.clientPlan.create({
    data: {
      clientId: id,
      planId: parsed.data.planId,
      month: parsed.data.month,
      year: parsed.data.year,
      appliedBy: session!.user.id,
    },
  });

  await prisma.client.update({
    where: { id },
    data: { activePlanId: parsed.data.planId },
  });

  const tasks = await Promise.all(
    parsed.data.tasks.map((t) =>
      prisma.task.create({
        data: {
          clientId: id,
          title: t.title,
          type: t.type,
          dueDate: new Date(t.dueDate),
          assignedTo: t.assignedTo || null,
          planMonth: parsed.data.month,
          planYear: parsed.data.year,
        },
      })
    )
  );

  await logAction(session!.user.id, "APPLY_PLAN", id, undefined, {
    planId: parsed.data.planId,
    planName: plan.name,
    month: parsed.data.month,
    year: parsed.data.year,
    tasksCreated: tasks.length,
  });

  return NextResponse.json({ clientPlan, tasks }, { status: 201 });
}
