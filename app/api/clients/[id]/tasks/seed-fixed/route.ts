import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { endOfMonthUTC } from "@/lib/utils";
import { z } from "zod";

// Materializa as demandas fixas do cliente como Task em "A fazer" para o mês/ano
// informado. Idempotente: se já existe uma task daquela demanda no mês (mesmo
// apagada), não recria — então rodar várias vezes não duplica nem ressuscita o
// que o usuário removeu.

const schema = z.object({ month: z.number().int().min(1).max(12), year: z.number().int() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { month, year } = parsed.data;

  const demands = await prisma.fixedDemand.findMany({
    where: { clientId: id, deletedAt: null, active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  if (demands.length === 0) return NextResponse.json({ created: 0 });

  // Demandas que JÁ têm task neste mês (inclui soft-deleted, para não ressuscitar).
  const existing = await prisma.task.findMany({
    where: { clientId: id, planMonth: month, planYear: year, fixedDemandId: { in: demands.map((d) => d.id) } },
    select: { fixedDemandId: true },
  });
  const seeded = new Set(existing.map((t) => t.fixedDemandId));

  const pending = demands.filter((d) => !seeded.has(d.id));
  if (pending.length === 0) return NextResponse.json({ created: 0 });

  const dueDate = endOfMonthUTC(year, month); // prazo: até o fim do mês

  await prisma.task.createMany({
    data: pending.map((d, i) => ({
      clientId: id,
      title: d.title,
      type: d.type,
      description: d.description,
      priority: d.priority,
      status: "TODO" as const,
      planMonth: month,
      planYear: year,
      dueDate,
      fixedDemandId: d.id,
      order: 1000 + i, // entram ao fim da coluna "A fazer"
    })),
  });

  return NextResponse.json({ created: pending.length });
}
