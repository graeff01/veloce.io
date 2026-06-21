import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { backfillFunnelForConnection } from "@/lib/wa-funnel";

export const runtime = "nodejs";

// POST — classifica o funil das conversas JÁ existentes deste cliente pelo
// histórico de mensagens (respeita trava manual). Idempotente.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: id }, select: { vertical: true } });
  const result = await backfillFunnelForConnection(conn.id, cfg?.vertical);

  return NextResponse.json(result);
}
