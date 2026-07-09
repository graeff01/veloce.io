import { NextResponse } from "next/server";
import { drainInbound } from "@/lib/ai-agent/queue-worker";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// Dispara o worker de replay da fila durável (F0). Pensado para um cron:
//   Authorization: Bearer $AI_QUEUE_DRAIN_TOKEN
// Sem o token configurado, exige sessão autenticada (uso manual/diagnóstico).
async function handle(req: Request) {
  const token = process.env.AI_QUEUE_DRAIN_TOKEN;
  const auth = req.headers.get("authorization");
  const viaToken = token && auth === `Bearer ${token}`;

  if (!viaToken) {
    const { error } = await requireAuth("clients:read");
    if (error) return error;
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
  const result = await drainInbound(limit);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
