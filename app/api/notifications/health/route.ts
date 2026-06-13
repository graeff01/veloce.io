import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { getFailureStats } from "@/lib/notifications/digest";
import { MAX_ATTEMPTS } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";

// GET — saúde do envio de notificações: quantas desistiram (esgotaram tentativas)
// nas últimas 24h, por tipo. Para inspeção rápida sem abrir o banco.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const stats = await getFailureStats(MAX_ATTEMPTS);
  return NextResponse.json({ maxAttempts: MAX_ATTEMPTS, ...stats });
}
