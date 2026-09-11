import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idsDasConexoes } from "@/lib/wa-connections";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — contadores dos badges da barra mobile (Aguardando + Orçamentos), pra a barra ficar
// IGUAL em qualquer tela do portal (a de Conversas contava a lista no cliente; as outras
// telas não têm a lista). Leve: só dois counts.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token);
  if (error) return NextResponse.json({ waiting: 0, reviews: 0 }); // badge nunca vira erro na UI

  const connIds = await idsDasConexoes(portal.clientId);
  let waiting = 0;
  if (connIds.length) {
    // "Aguardando" = contatos cuja ÚLTIMA mensagem é do cliente (direction != 'out').
    // DISTINCT ON pega a última msg por contato (usa o índice contactId+timestamp).
    // `= ANY(...)` cobre TODOS os números do cliente: o contador da barra tem que
    // dizer o mesmo que a lista de conversas, que já soma os números.
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (
        SELECT DISTINCT ON (m."contactId") m."direction" AS direction
        FROM "WaMessage" m
        WHERE m."connectionId" = ANY(${connIds}::text[])
        ORDER BY m."contactId", m."timestamp" DESC
      ) t WHERE t.direction <> 'out'`.catch(() => [{ n: 0 }] as { n: number }[]);
    waiting = rows[0]?.n ?? 0;
  }

  const reviews = await prisma.quote.count({ where: { clientId: portal.clientId, status: "pending_review" } }).catch(() => 0);

  return NextResponse.json({ waiting, reviews });
}
