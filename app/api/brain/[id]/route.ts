import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  title:    z.string().min(1).optional(),
  content:  z.string().optional().nullable(),
  category: z.string().optional(),
  links:    z.array(z.string()).optional(),
  tags:     z.array(z.string()).optional(),
  pinned:   z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const item = await prisma.brain.update({
    where: { id },
    data:  parsed.data,
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json(item);
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  await prisma.brain.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
