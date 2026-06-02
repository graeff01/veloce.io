import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

// Status por mês de lançamentos recorrentes e de equipe.
// refKey é o id exibido: "rec-<financeEntryId>" ou "team-<teamMemberId>".

const upsertSchema = z.object({
  refKey: z.string().min(1),
  year:   z.number().int(),
  month:  z.number().int().min(1).max(12),
  status: z.enum(["PAGO", "PENDENTE", "VENCIDO"]),
});

// GET ?month=&year= → overrides do mês (mapa refKey -> status)
export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") ?? "");
  const year  = parseInt(searchParams.get("year") ?? "");

  const where: Record<string, unknown> = {};
  if (!isNaN(month)) where.month = month;
  if (!isNaN(year)) where.year = year;

  const overrides = await prisma.financeStatusOverride.findMany({ where });
  const map: Record<string, string> = {};
  for (const o of overrides) map[o.refKey] = o.status;
  return NextResponse.json(map);
}

// POST { refKey, year, month, status } → upsert do override do mês
export async function POST(req: Request) {
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });

  const { refKey, year, month, status } = parsed.data;

  const override = await prisma.financeStatusOverride.upsert({
    where: { refKey_year_month: { refKey, year, month } },
    create: { refKey, year, month, status },
    update: { status },
  });

  await logAction(session!.user.id, "FINANCE_STATUS", undefined, undefined, { refKey, year, month, status });

  return NextResponse.json(override);
}
