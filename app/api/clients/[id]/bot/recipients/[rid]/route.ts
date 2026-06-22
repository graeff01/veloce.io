import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// DELETE — remove (desativa) um destinatário do bot do cliente.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  await prisma.clientBotRecipient.updateMany({ where: { id: rid, clientId: id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
