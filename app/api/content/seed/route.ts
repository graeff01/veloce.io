import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) });

// POST — gera as pautas do mês a partir dos slots recorrentes. Idempotente: não
// recria pauta já existente (mesmo slot + mesma data), inclusive se foi apagada.
export async function POST(req: Request) {
  const { error, session } = await requireAuth("content:create");
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { year, month } = parsed.data;

  const recs = await prisma.contentRecurrence.findMany({ where: { deletedAt: null, active: true } });
  if (recs.length === 0) return NextResponse.json({ created: 0 });

  // Datas de cada slot no mês (todas as ocorrências do weekday), ao meio-dia UTC.
  const dates: { rec: typeof recs[number]; date: Date }[] = [];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (const rec of recs) {
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (d.getUTCDay() === rec.weekday) dates.push({ rec, date: d });
    }
  }
  if (dates.length === 0) return NextResponse.json({ created: 0 });

  // Já existentes (qualquer status, inclusive apagadas) — não duplica.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const existing = await prisma.contentPost.findMany({
    where: { recurrenceId: { in: recs.map((r) => r.id) }, publishDate: { gte: monthStart, lt: monthEnd } },
    select: { recurrenceId: true, publishDate: true },
  });
  const seen = new Set(existing.map((e) => `${e.recurrenceId}:${e.publishDate?.toISOString()}`));

  const toCreate = dates.filter(({ rec, date }) => !seen.has(`${rec.id}:${date.toISOString()}`));
  if (toCreate.length === 0) return NextResponse.json({ created: 0 });

  await prisma.contentPost.createMany({
    data: toCreate.map(({ rec, date }, i) => ({
      title: rec.label,
      type: rec.type,
      status: "pauta",
      publishDate: date,
      recurrenceId: rec.id,
      order: 1000 + i,
      createdById: session!.user.id,
    })),
  });

  return NextResponse.json({ created: toCreate.length });
}
