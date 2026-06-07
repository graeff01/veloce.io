import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  leadName: z.string().trim().min(1).max(120),
  leadPhone: z.string().trim().max(40).optional(),
  car: z.string().trim().max(120).optional(),
  scheduledAt: z.string().min(1),
  durationMin: z.number().int().min(10).max(480).optional(),
  status: z.enum(["agendada", "confirmada", "compareceu", "faltou", "cancelada"]).optional(),
  notes: z.string().trim().max(2000).optional(),
  contactId: z.string().optional(),
});

// GET — visitas num intervalo. ?from=&to= (ISO). Sem intervalo: mês atual.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const visits = await prisma.visit.findMany({
    where: { clientId: id, scheduledAt: { gte: start, lt: end } },
    orderBy: { scheduledAt: "asc" },
  });
  return NextResponse.json(visits);
}

// POST — cria uma visita
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const visit = await prisma.visit.create({
    data: {
      clientId: id,
      leadName: d.leadName,
      leadPhone: d.leadPhone || null,
      car: d.car || null,
      scheduledAt: new Date(d.scheduledAt),
      durationMin: d.durationMin ?? 30,
      status: d.status ?? "agendada",
      notes: d.notes || null,
      contactId: d.contactId || null,
    },
  });
  return NextResponse.json(visit, { status: 201 });
}
