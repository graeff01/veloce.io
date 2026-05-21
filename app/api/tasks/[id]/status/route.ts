import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]),
  order: z.number().min(0).optional(),
  orderedIds: z.array(z.string()).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:update");
  if (error) return error;

  const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const [, updated] = await prisma.$transaction([
    ...(parsed.data.orderedIds?.map((taskId, index) =>
      prisma.task.update({
        where: { id: taskId },
        data: {
          order: index,
          ...(taskId === id ? { status: parsed.data.status } : {}),
        },
      })
    ) ?? []),
    prisma.task.update({
      where: { id },
      data: {
        status: parsed.data.status,
        ...(parsed.data.order !== undefined && { order: parsed.data.order }),
      },
    }),
  ]).then((results) => [results[0], results[results.length - 1]]);

  await logAction(session!.user.id, "UPDATE_STATUS", task.clientId, task.id, {
    from: task.status,
    to: parsed.data.status,
  });

  return NextResponse.json(updated);
}
