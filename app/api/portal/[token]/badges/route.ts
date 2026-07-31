import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — contadores dos badges da barra mobile (Aguardando + Orçamentos), pra a barra ficar
// IGUAL em qualquer tela do portal (a de Conversas contava a lista no cliente; as outras
// telas não têm a lista). Leve: só dois counts.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ waiting: 0, reviews: 0 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
  let waiting = 0;
  if (conn) {
    // "Aguardando" = contatos cuja ÚLTIMA mensagem é do cliente (direction != 'out').
    // DISTINCT ON pega a última msg por contato (usa o índice contactId+timestamp).
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (
        SELECT DISTINCT ON (m."contactId") m."direction" AS direction
        FROM "WaMessage" m
        WHERE m."connectionId" = ${conn.id}
        ORDER BY m."contactId", m."timestamp" DESC
      ) t WHERE t.direction <> 'out'`.catch(() => [{ n: 0 }] as { n: number }[]);
    waiting = rows[0]?.n ?? 0;
  }

  const reviews = await prisma.quote.count({ where: { clientId: portal.clientId, status: "pending_review" } }).catch(() => 0);

  return NextResponse.json({ waiting, reviews });
}
