import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health check — público de propósito (Railway/monitor batem sem credencial).
// Não expõe dados: só o status da app e a saúde da conexão com o banco.
export async function GET() {
  const t0 = Date.now();
  try {
    await prismaUnscoped.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", latencyMs: Date.now() - t0 });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
