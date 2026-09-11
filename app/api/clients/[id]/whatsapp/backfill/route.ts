import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idsDasConexoes, filtroConexoes } from "@/lib/wa-connections";
import { requireAuth } from "@/lib/api-helpers";
import { rebuildConversations, closeInactiveConversations, backfillAdLeads } from "@/lib/wa-conversation";
import { WA_THRESHOLDS } from "@/lib/wa-metrics";

// POST — reconstrói as conversas a partir das mensagens já armazenadas.
// Útil após a 1ª implantação (popular o histórico) ou para recalcular.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const connIds = await idsDasConexoes(id);
  if (connIds.length === 0) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  let rebuilt = 0, closed = 0, adLeads = 0;
  for (const connId of connIds) {
    rebuilt += await rebuildConversations(connId);
    closed += await closeInactiveConversations(connId, WA_THRESHOLDS.closeAfterHours);
    adLeads += await backfillAdLeads(connId);
  }
  return NextResponse.json({ rebuilt, closed, adLeads });
}
