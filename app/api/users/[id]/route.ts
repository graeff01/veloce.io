import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "OPERATIONAL", "DESIGNER"]).optional(),
  operationalRole: z.string().optional(),
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

  if (parsed.data.email && parsed.data.email !== user.email) {
    const existing = await prisma.user.findFirst({
      where: { email: parsed.data.email, id: { not: id }, deletedAt: null },
    });
    if (existing) return NextResponse.json({ error: "Email jÃ¡ cadastrado" }, { status: 409 });
  }

  const hashedPassword = parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.email && { email: parsed.data.email }),
      ...(hashedPassword && { password: hashedPassword }),
      ...(parsed.data.role && { role: parsed.data.role }),
      ...(parsed.data.operationalRole !== undefined && { operationalRole: parsed.data.operationalRole || null }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
    },
    select: { id: true, name: true, email: true, role: true, operationalRole: true, active: true, createdAt: true },
  });

  await logAction(session!.user.id, "UPDATE_USER", undefined, undefined, {
    userId: id,
    emailChanged: Boolean(parsed.data.email && parsed.data.email !== user.email),
    passwordChanged: Boolean(hashedPassword),
  });

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
