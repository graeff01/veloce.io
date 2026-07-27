import { NextResponse } from "next/server";
import { prismaUnscoped, getPoolStats } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health check — público de propósito (Railway/monitor batem sem credencial).
// Não expõe dados: só o status da app, a saúde da conexão com o banco e a
// saturação do pool (`pool.waiting` > 0 sustentado = gargalo de conexão sob carga).
export async function GET() {
  const t0 = Date.now();
  try {
    await prismaUnscoped.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", latencyMs: Date.now() - t0, pool: getPoolStats() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down", pool: getPoolStats() }, { status: 503 });
  }
}
