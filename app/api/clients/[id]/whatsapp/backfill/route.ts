import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { rebuildConversations, closeInactiveConversations, backfillAdLeads } from "@/lib/wa-conversation";
import { WA_THRESHOLDS } from "@/lib/wa-metrics";

// POST — reconstrói as conversas a partir das mensagens já armazenadas.
// Útil após a 1ª implantação (popular o histórico) ou para recalcular.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const rebuilt = await rebuildConversations(conn.id);
  const closed = await closeInactiveConversations(conn.id, WA_THRESHOLDS.closeAfterHours);
  const adLeads = await backfillAdLeads(conn.id);
  return NextResponse.json({ rebuilt, closed, adLeads });
}
