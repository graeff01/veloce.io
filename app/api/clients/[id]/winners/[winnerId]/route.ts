import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// DELETE → remove um vencedor do swipe.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; winnerId: string }> }) {
  const { id, winnerId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  await prisma.winningCreative.deleteMany({ where: { id: winnerId, clientId: id } });
  return NextResponse.json({ ok: true });
}
