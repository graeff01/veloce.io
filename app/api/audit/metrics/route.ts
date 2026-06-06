import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { computeAttendanceMetrics } from "@/lib/wa-metrics";

// GET /api/audit/metrics?clientId=&year=&month= → métricas de atendimento do período
export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const monthParam = url.searchParams.get("month");
  const month = monthParam ? Number(monthParam) : null;
  const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const conn = await prisma.waConnection.findUnique({ where: { clientId } });
  if (!conn) return NextResponse.json({ error: "Cliente sem WhatsApp conectado" }, { status: 404 });

  const metrics = await computeAttendanceMetrics(conn.id, start, end);
  return NextResponse.json(metrics);
}
