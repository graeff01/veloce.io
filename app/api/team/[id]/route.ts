import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  type:       z.enum(["FUNCIONARIO", "PRESTADOR"]).optional(),
  name:       z.string().min(1).optional(),
  role:       z.string().optional(),
  department: z.string().optional(),
  email:      z.string().optional(),
  phone:      z.string().optional(),
  salary:     z.number().optional(),
  unitValue:  z.number().nullable().optional(),
  unit:       z.string().nullable().optional(),
  status:     z.enum(["ATIVO", "INATIVO"]).optional(),
  startDate:  z.string().nullable().optional(),
  notes:      z.string().nullable().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const d = parsed.data;
  const member = await prisma.teamMember.update({
    where: { id },
    data: {
      ...(d.type       !== undefined && { type:       d.type }),
      ...(d.name       !== undefined && { name:       d.name }),
      ...(d.role       !== undefined && { role:       d.role }),
      ...(d.department !== undefined && { department: d.department }),
      ...(d.email      !== undefined && { email:      d.email }),
      ...(d.phone      !== undefined && { phone:      d.phone }),
      ...(d.salary     !== undefined && { salary:     d.salary }),
      ...(d.unitValue  !== undefined && { unitValue:  d.unitValue }),
      ...(d.unit       !== undefined && { unit:       d.unit }),
      ...(d.status     !== undefined && { status:     d.status }),
      ...(d.startDate  !== undefined && { startDate:  d.startDate ? new Date(d.startDate) : null }),
      ...(d.notes      !== undefined && { notes:      d.notes }),
    },
  });

  await logAction(session!.user.id, "UPDATE_TEAM_MEMBER", undefined, undefined, { id, name: member.name });

  return NextResponse.json(member);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const member = await prisma.teamMember.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAction(session!.user.id, "DELETE_TEAM_MEMBER", undefined, undefined, { id, name: member.name });
  return NextResponse.json({ ok: true });
}
