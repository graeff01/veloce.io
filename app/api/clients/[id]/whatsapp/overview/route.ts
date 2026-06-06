import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { computeOverview, WA_THRESHOLDS } from "@/lib/wa-metrics";
import { closeInactiveConversations } from "@/lib/wa-conversation";

// GET — visão geral da operação no período. Parâmetros: ?from=&to= (ISO) ou ?year=&month=
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let start: Date, end: Date;
  if (fromParam && toParam) {
    start = new Date(fromParam);
    end = new Date(toParam);
  } else {
    const now = new Date();
    const year = Number(url.searchParams.get("year")) || now.getFullYear();
    const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 1);
  }

  // Mantém o rótulo "closed" fresco sem depender de cron (updateMany indexado).
  await closeInactiveConversations(conn.id, WA_THRESHOLDS.closeAfterHours);

  const overview = await computeOverview(conn.id, start, end);
  return NextResponse.json(overview);
}
