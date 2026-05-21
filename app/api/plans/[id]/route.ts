import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  frequency: z.string().optional(),
  intensity: z.string().optional(),
  averageDeadlineDays: z.number().min(0).optional(),
  reviewDays: z.number().min(0).optional(),
  demandLimit: z.number().min(0).optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      type: z.string().min(1),
      quantity: z.number().min(1),
      description: z.string().optional(),
    })
  ).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("plans:read");
  if (error) return error;

  const plan = await prisma.plan.findFirst({
    where: { id, deletedAt: null },
    include: {
      items: true,
      clientPlans: {
        include: { client: { select: { id: true, name: true } } },
        orderBy: { appliedAt: "desc" },
      },
    },
  });

  if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  return NextResponse.json(plan);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("plans:update");
  if (error) return error;

  const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  if (parsed.data.items) {
    await prisma.planItem.deleteMany({ where: { planId: id } });
  }

  const updated = await prisma.plan.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.category !== undefined && { category: parsed.data.category || null }),
      ...(parsed.data.frequency !== undefined && { frequency: parsed.data.frequency || null }),
      ...(parsed.data.intensity !== undefined && { intensity: parsed.data.intensity || null }),
      ...(parsed.data.averageDeadlineDays !== undefined && { averageDeadlineDays: parsed.data.averageDeadlineDays ?? null }),
      ...(parsed.data.reviewDays !== undefined && { reviewDays: parsed.data.reviewDays ?? null }),
      ...(parsed.data.demandLimit !== undefined && { demandLimit: parsed.data.demandLimit ?? null }),
      ...(parsed.data.items && {
        items: { create: parsed.data.items.map(({ id: _, ...item }) => item) },
      }),
    },
    include: { items: true },
  });

  await logAction(session!.user.id, "UPDATE_PLAN", undefined, undefined, { name: updated.name });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("plans:delete");
  if (error) return error;

  const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });

  await prisma.plan.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAction(session!.user.id, "DELETE_PLAN", undefined, undefined, { name: plan.name });

  return NextResponse.json({ ok: true });
}
