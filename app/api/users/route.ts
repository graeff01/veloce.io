import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "OPERATIONAL", "DESIGNER"]).default("OPERATIONAL"),
  operationalRole: z.string().optional(),
});

export async function GET() {
  const { error } = await requireAuth("users:read");
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      operationalRole: true,
      active: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const { error, session } = await requireAuth("users:create");
  if (error) return error;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashedPassword,
      role: parsed.data.role,
      operationalRole: parsed.data.operationalRole || null,
    },
    select: { id: true, name: true, email: true, role: true, operationalRole: true, active: true, createdAt: true },
  });

  await logAction(session!.user.id, "CREATE_USER", undefined, undefined, { email: user.email, role: user.role });

  return NextResponse.json(user, { status: 201 });
}
