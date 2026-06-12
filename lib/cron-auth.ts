import { NextRequest, NextResponse } from "next/server";

// Proteção dos crons: header `authorization: Bearer <CRON_SECRET>` ou `x-cron-secret`.
// Retorna NextResponse de erro se inválido, ou null se autorizado.
export function checkCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided !== secret) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return null;
}
