import { NextResponse } from "next/server";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const noteSchema = z.object({
  note: z.string().trim().min(1).max(800),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:create");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Observacao invalida" }, { status: 400 });

  await logAction(session!.user.id, "ADD_NOTE", id, undefined, { note: parsed.data.note });

  return NextResponse.json({ ok: true }, { status: 201 });
}
