import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  type:        z.enum(["RECEITA", "DESPESA"]),
  mode:        z.enum(["RECORRENTE", "AVULSO"]).default("AVULSO"),
  description: z.string().min(1),
  category:    z.string().min(1),
  value:       z.number().positive(),
  date:        z.string(),
  status:      z.enum(["PAGO", "PENDENTE", "VENCIDO"]).default("PENDENTE"),
  clientId:    z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const month    = searchParams.get("month");
  const year     = searchParams.get("year");
  const clientId = searchParams.get("clientId");
  const mode     = searchParams.get("mode"); // RECORRENTE | AVULSO | all

  const where: Record<string, unknown> = { deletedAt: null };

  if (clientId) where.clientId = clientId;
  if (mode && mode !== "all") where.mode = mode;

  // Recorrentes repetem todo mês (stamped na exibição) — não filtra por data.
  // Avulsos (e a visão "all") filtram pelo mês/ano informado.
  if (month && year && mode !== "RECORRENTE") {
    const m = parseInt(month);
    const y = parseInt(year);
    where.date = {
      gte: new Date(y, m - 1, 1),
      lte: new Date(y, m, 0, 23, 59, 59),
    };
  }

  const entries = await prisma.financeEntry.findMany({
    where,
    include: { client: { select: { id: true, name: true, brand: true } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });

  const entry = await prisma.financeEntry.create({
    data: {
      type:        parsed.data.type,
      mode:        parsed.data.mode,
      description: parsed.data.description,
      category:    parsed.data.category,
      value:       parsed.data.value,
      date:        new Date(parsed.data.date),
      status:      parsed.data.status,
      clientId:    parsed.data.clientId || null,
      notes:       parsed.data.notes    || null,
    },
    include: { client: { select: { id: true, name: true, brand: true } } },
  });

  await logAction(session!.user.id, "CREATE_FINANCE", entry.clientId ?? undefined, undefined, {
    type: entry.type, value: entry.value, description: entry.description,
  });

  return NextResponse.json(entry, { status: 201 });
}
