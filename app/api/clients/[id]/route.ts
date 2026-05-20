import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PAUSED"]).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      clientPlans: {
        include: { plan: { include: { items: true } } },
        orderBy: { appliedAt: "desc" },
      },
    },
  });

  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [monthTasks, doneTasks, overdueTasks, recentLogs] = await Promise.all([
    prisma.task.count({ where: { clientId: id, deletedAt: null, dueDate: { gte: startOfMonth, lte: endOfMonth } } }),
    prisma.task.count({ where: { clientId: id, deletedAt: null, status: "DONE", dueDate: { gte: startOfMonth, lte: endOfMonth } } }),
    prisma.task.count({ where: { clientId: id, deletedAt: null, dueDate: { lt: now }, status: { not: "DONE" } } }),
    prisma.executionLog.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    ...client,
    stats: {
      monthTasks,
      doneTasks,
      overdueTasks,
      completionRate: monthTasks > 0 ? Math.round((doneTasks / monthTasks) * 100) : 0,
    },
    recentLogs,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const updated = await prisma.client.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.email !== undefined && { email: parsed.data.email || null }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone || null }),
      ...(parsed.data.status && { status: parsed.data.status }),
    },
  });

  await logAction(session!.user.id, "UPDATE_CLIENT", id, undefined, { before: client, after: parsed.data });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:delete");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  await prisma.client.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAction(session!.user.id, "DELETE_CLIENT", id, undefined, { name: client.name });

  return NextResponse.json({ ok: true });
}
