import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// DELETE — remove um slot recorrente (não apaga as pautas já geradas).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("content:create");
  if (error) return error;

  const rec = await prisma.contentRecurrence.findFirst({ where: { id, deletedAt: null } });
  if (!rec) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.contentRecurrence.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
