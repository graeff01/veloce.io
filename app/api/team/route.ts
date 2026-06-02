import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  type:       z.enum(["FUNCIONARIO", "PRESTADOR"]),
  name:       z.string().min(1),
  role:       z.string().default(""),
  department: z.string().default(""),
  email:      z.string().default(""),
  phone:      z.string().default(""),
  salary:     z.number().default(0),
  unitValue:  z.number().optional().nullable(),
  unit:       z.string().optional().nullable(),
  status:     z.enum(["ATIVO", "INATIVO"]).default("ATIVO"),
  startDate:  z.string().optional().nullable(),
  notes:      z.string().optional().nullable(),
});

export async function GET() {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const members = await prisma.teamMember.findMany({
    where:   { deletedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(members);
}

export async function POST(req: Request) {
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });

  const member = await prisma.teamMember.create({
    data: {
      type:       parsed.data.type,
      name:       parsed.data.name,
      role:       parsed.data.role,
      department: parsed.data.department,
      email:      parsed.data.email,
      phone:      parsed.data.phone,
      salary:     parsed.data.salary,
      unitValue:  parsed.data.unitValue  ?? null,
      unit:       parsed.data.unit       ?? null,
      status:     parsed.data.status,
      startDate:  parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      notes:      parsed.data.notes     ?? null,
    },
  });

  return NextResponse.json(member, { status: 201 });
}
