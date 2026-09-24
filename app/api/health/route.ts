import { NextResponse } from "next/server";
import { prismaUnscoped, getPoolStats } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Qual COMMIT está no ar. O Railway injeta o sha no build.
//
// Existe porque a bateria de QA (scripts/qa-inject.ts) roda contra PRODUÇÃO: sem
// saber se o deploy do commit já chegou, ela testa código antigo e o resultado
// mente nas duas direções — deu falso vermelho três vezes seguidas numa sessão de
// correções, e cada rodada custa ~3 minutos e tokens de modelo.
//
// Só os 7 primeiros caracteres do sha, que é o que o git mostra. Não é segredo: o
// repositório é privado e o sha por si não dá acesso a nada.
const VERSAO = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "desconhecida").slice(0, 7);

// Health check — público de propósito (Railway/monitor batem sem credencial).
// Não expõe dados: só o status da app, a saúde da conexão com o banco, a
// saturação do pool (`pool.waiting` > 0 sustentado = gargalo de conexão sob carga)
// e o commit no ar.
export async function GET() {
  const t0 = Date.now();
  try {
    await prismaUnscoped.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", version: VERSAO, latencyMs: Date.now() - t0, pool: getPoolStats() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down", version: VERSAO, pool: getPoolStats() }, { status: 503 });
  }
}
