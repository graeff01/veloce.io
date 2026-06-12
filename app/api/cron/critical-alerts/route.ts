import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { runCriticalAlerts } from "@/lib/notifications/run";

export const runtime = "nodejs";

// Cron de ALERTAS CRÍTICOS (opcional — o agendador interno já dispara sozinho).
//   curl -X POST https://<app>/api/cron/critical-alerts -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  return NextResponse.json(await runCriticalAlerts());
}
