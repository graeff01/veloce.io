import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

export const runtime = "nodejs";

// Slots recorrentes (ex.: feed terça, carrossel quinta) que geram pautas todo mês.
export async function GET() {
  const { error } = await requireAuth("content:read");
  if (error) return error;
  const recs = await prisma.contentRecurrence.findMany({
    where: { deletedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(recs);
}

const schema = z.object({
  label: z.string().min(1),
  type: z.enum(["feed", "carrossel"]).optional(),
  weekday: z.number().int().min(0).max(6),
});

export async function POST(req: Request) {
  const { error } = await requireAuth("content:create");
  if (error) return error;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const count = await prisma.contentRecurrence.count({ where: { deletedAt: null } });
  const rec = await prisma.contentRecurrence.create({
    data: { label: parsed.data.label.trim(), type: parsed.data.type ?? "feed", weekday: parsed.data.weekday, order: count },
  });
  return NextResponse.json(rec, { status: 201 });
}
