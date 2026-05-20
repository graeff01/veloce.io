import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const schema = z.object({ text: z.string().min(1), order: z.number().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("checklist:update");
  if (error) return error;

  const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const item = await prisma.checklist.create({
    data: {
      taskId: id,
      text: parsed.data.text,
      order: parsed.data.order ?? 0,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
