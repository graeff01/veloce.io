import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { parseDueDate } from "@/lib/utils";
import { z } from "zod";

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional(),
  blocker: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  dueDate: z.string().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]).optional(),
  order: z.number().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:update");
  if (error) return error;

  const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const body = await req.json();
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...(parsed.data.title && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
      ...(parsed.data.blocker !== undefined && { blocker: parsed.data.blocker || null }),
      ...(parsed.data.assignedTo !== undefined && { assignedTo: parsed.data.assignedTo }),
      ...(parsed.data.dueDate && { dueDate: parseDueDate(parsed.data.dueDate) }),
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.order !== undefined && { order: parsed.data.order }),
    },
    include: {
      assignee: { select: { id: true, name: true } },
      checklists: true,
    },
  });

  if (parsed.data.status && parsed.data.status !== task.status) {
    await logAction(session!.user.id, "UPDATE_STATUS", task.clientId, task.id, {
      from: task.status,
      to: parsed.data.status,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:delete");
  if (error) return error;

  const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  await prisma.task.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAction(session!.user.id, "DELETE_TASK", task.clientId, task.id, { title: task.title });

  return NextResponse.json({ ok: true });
}
