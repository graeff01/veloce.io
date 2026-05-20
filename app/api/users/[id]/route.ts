import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "OPERATIONAL"]).optional(),
  active: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("users:update");
  if (error) return error;

  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.role && { role: parsed.data.role }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  await logAction(session!.user.id, "UPDATE_USER", undefined, undefined, { userId: id });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("users:delete");
  if (error) return error;

  if (session!.user.id === id) {
    return NextResponse.json({ error: "Você não pode excluir sua própria conta" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });

  await logAction(session!.user.id, "DELETE_USER", undefined, undefined, { userId: id });

  return NextResponse.json({ ok: true });
}
