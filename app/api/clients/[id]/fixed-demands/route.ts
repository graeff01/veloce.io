import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

// Demandas fixas (recorrentes) de um cliente. Cadastradas no Perfil; viram Task
// em "A fazer" todo início de mês (ver /tasks/seed-fixed).

const createSchema = z.object({
  title: z.string().min(1),
  type: z.string().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional(),
  description: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:read");
  if (error) return error;

  const demands = await prisma.fixedDemand.findMany({
    where: { clientId: id, deletedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(demands);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });

  const count = await prisma.fixedDemand.count({ where: { clientId: id, deletedAt: null } });

  const demand = await prisma.fixedDemand.create({
    data: {
      clientId: id,
      title: parsed.data.title.trim(),
      type: parsed.data.type || null,
      priority: parsed.data.priority ?? "NORMAL",
      description: parsed.data.description || null,
      order: count,
    },
  });

  return NextResponse.json(demand, { status: 201 });
}
