import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  leadName: z.string().trim().min(1).max(120).optional(),
  leadPhone: z.string().trim().max(40).nullable().optional(),
  car: z.string().trim().max(120).nullable().optional(),
  scheduledAt: z.string().min(1).optional(),
  durationMin: z.number().int().min(10).max(480).optional(),
  status: z.enum(["agendada", "confirmada", "compareceu", "faltou", "cancelada"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; visitId: string }> }) {
  const { id, visitId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const existing = await prisma.visit.findFirst({ where: { id: visitId, clientId: id } });
  if (!existing) return NextResponse.json({ error: "Visita não encontrada" }, { status: 404 });

  const d = parsed.data;
  const visit = await prisma.visit.update({
    where: { id: visitId },
    data: {
      ...(d.leadName !== undefined ? { leadName: d.leadName } : {}),
      ...(d.leadPhone !== undefined ? { leadPhone: d.leadPhone } : {}),
      ...(d.car !== undefined ? { car: d.car } : {}),
      ...(d.scheduledAt ? { scheduledAt: new Date(d.scheduledAt) } : {}),
      ...(d.durationMin !== undefined ? { durationMin: d.durationMin } : {}),
      ...(d.status ? { status: d.status } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    },
  });
  return NextResponse.json(visit);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; visitId: string }> }) {
  const { id, visitId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  await prisma.visit.deleteMany({ where: { id: visitId, clientId: id } });
  return NextResponse.json({ ok: true });
}
