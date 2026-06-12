import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/clients/[id]/health → status compacto das integrações do cliente.
// Derivado só do banco (rápido): conexão + recência do último sync/evento.
type Status = "ok" | "warn" | "down";

function hoursSince(d: Date | null | undefined): number | null {
  if (!d) return null;
  return (Date.now() - new Date(d).getTime()) / 3_600_000;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const [meta, wa] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { clientId: id }, select: { lastSyncAt: true, lastAdSyncAt: true } }),
    prisma.waConnection.findUnique({ where: { clientId: id }, select: { lastEventAt: true } }),
  ]);

  // Meta: verde se sincronizou nas últimas 24h; amarelo se conectado mas parado; vermelho se não conectado.
  const lastSync = meta ? (meta.lastAdSyncAt ?? meta.lastSyncAt) : null;
  const metaH = hoursSince(lastSync);
  const metaStatus: Status = !meta ? "down" : metaH != null && metaH <= 24 ? "ok" : "warn";

  // WhatsApp: verde se recebeu evento nas últimas 48h; amarelo se conectado sem evento; vermelho se não conectado.
  const waH = hoursSince(wa?.lastEventAt);
  const waStatus: Status = !wa ? "down" : waH != null && waH <= 48 ? "ok" : "warn";

  return NextResponse.json({
    meta: { connected: !!meta, lastSyncAt: lastSync ?? null, status: metaStatus },
    whatsapp: { connected: !!wa, lastEventAt: wa?.lastEventAt ?? null, status: waStatus },
  });
}
