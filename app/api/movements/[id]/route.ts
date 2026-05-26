import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  title:       z.string().min(1).optional(),
  category:    z.string().min(1).optional(),
  status:      z.enum(["PLANNED","IN_PROGRESS","REVIEW","DONE","ARCHIVED"]).optional(),
  priority:    z.enum(["CRITICAL","HIGH","NORMAL","LOW"]).optional(),
  date:        z.string().optional(),
  endDate:     z.string().optional().nullable(),
  assignedTo:  z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  links:       z.array(z.string()).optional(),
  tags:        z.array(z.string()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const movement = await prisma.movement.findFirst({
    where: { id, deletedAt: null },
    include: {
      client:   { select: { id: true, name: true, brand: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  if (!movement) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(movement);
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { date, endDate, ...rest } = parsed.data;

  const movement = await prisma.movement.update({
    where: { id },
    data: {
      ...rest,
      ...(date    ? { date:    new Date(date) }    : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
    include: {
      client:   { select: { id: true, name: true, brand: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(movement);
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  await prisma.movement.update({
    where: { id },
    data:  { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
