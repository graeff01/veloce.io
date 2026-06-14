import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.string().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional(),
  description: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; demandId: string }> }) {
  const { id, demandId } = await params;
  const { error } = await requireAuth("tasks:update");
  if (error) return error;

  const demand = await prisma.fixedDemand.findFirst({ where: { id: demandId, clientId: id, deletedAt: null } });
  if (!demand) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const updated = await prisma.fixedDemand.update({
    where: { id: demandId },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title.trim() }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type || null }),
      ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description || null }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; demandId: string }> }) {
  const { id, demandId } = await params;
  const { error } = await requireAuth("tasks:delete");
  if (error) return error;

  const demand = await prisma.fixedDemand.findFirst({ where: { id: demandId, clientId: id, deletedAt: null } });
  if (!demand) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });

  await prisma.fixedDemand.update({ where: { id: demandId }, data: { deletedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
