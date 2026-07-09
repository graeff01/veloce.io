import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// Drill-down do painel de qualidade: últimas interações de um cliente. Com
// ?flagged=1, só as que merecem inspeção (bloqueadas, erro ou abstidas).
export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const flagged = url.searchParams.get("flagged") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25), 1), 100);

  const where = flagged
    ? { clientId, OR: [{ status: { in: ["blocked", "error"] } }, { decision: { in: ["abster", "sem_fonte", "bloqueado"] } }] }
    : { clientId };

  const rows = await prisma.aiInteraction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, inbound: true, outbound: true, decision: true, status: true,
      createdAt: true, latencyMs: true, contextUsed: true, inboundMediaType: true,
    },
  });

  return NextResponse.json({ interactions: rows });
}
