import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { runDailyDigest } from "@/lib/notifications/run";

export const runtime = "nodejs";

// Cron do RESUMO DO DIA (opcional — o agendador interno já dispara sozinho).
//   curl -X POST https://<app>/api/cron/daily-digest -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  return NextResponse.json(await runDailyDigest());
}
