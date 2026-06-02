import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  status:      z.enum(["PAGO", "PENDENTE", "VENCIDO"]).optional(),
  description: z.string().min(1).optional(),
  category:    z.string().optional(),
  value:       z.number().positive().optional(),
  date:        z.string().optional(),
  clientId:    z.string().nullable().optional(),
  notes:       z.string().nullable().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const entry = await prisma.financeEntry.update({
    where: { id },
    data: {
      ...(parsed.data.status      !== undefined && { status:      parsed.data.status }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.category    !== undefined && { category:    parsed.data.category }),
      ...(parsed.data.value       !== undefined && { value:       parsed.data.value }),
      ...(parsed.data.date        !== undefined && { date:        new Date(parsed.data.date) }),
      ...(parsed.data.clientId    !== undefined && { clientId:    parsed.data.clientId }),
      ...(parsed.data.notes       !== undefined && { notes:       parsed.data.notes }),
    },
    include: { client: { select: { id: true, name: true, brand: true } } },
  });

  await logAction(session!.user.id, "UPDATE_FINANCE", entry.clientId ?? undefined, undefined, {
    status: entry.status, value: entry.value, description: entry.description,
  });

  return NextResponse.json(entry);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const entry = await prisma.financeEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAction(session!.user.id, "DELETE_FINANCE", entry.clientId ?? undefined, undefined, {
    description: entry.description, value: entry.value,
  });
  return NextResponse.json({ ok: true });
}
