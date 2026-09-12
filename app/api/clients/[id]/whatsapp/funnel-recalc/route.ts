import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idsDasConexoes, filtroConexoes } from "@/lib/wa-connections";
import { requireAuth } from "@/lib/api-helpers";
import { backfillFunnelForConnection } from "@/lib/wa-funnel";

export const runtime = "nodejs";

// POST — reclassifica o funil de TODOS os leads do cliente pelo histórico
// (anúncio + orgânico). Ignora os travados manualmente. Idempotente.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const connIds = await idsDasConexoes(id);
  if (connIds.length === 0) return NextResponse.json({ error: "Cliente sem WhatsApp conectado" }, { status: 404 });

  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: id }, select: { vertical: true } });
  // Número a número: o recálculo é por conexão, e recalcular só o primeiro
  // deixaria o funil dos outros congelado no que estava.
  const res = { scanned: 0, updated: 0 };
  for (const connId of connIds) {
    const r = await backfillFunnelForConnection(connId, cfg?.vertical);
    res.scanned += r.scanned; res.updated += r.updated;
  }
  return NextResponse.json(res);
}
