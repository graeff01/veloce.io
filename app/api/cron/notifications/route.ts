import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { runDueJobs } from "@/lib/notifications/scheduler-core";

export const runtime = "nodejs";

// Cron UNIFICADO das notificações — a "prova de bala": decoupla o disparo do
// processo web. Aponte um cron externo (cron-job.org, GitHub Action, Railway
// cron) aqui a cada 5–10 min. A própria rota decide o que enviar pela hora BRT;
// gates no banco garantem 1x. O agendador interno continua como backup.
//   curl -X POST https://<app>/api/cron/notifications -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  await runDueJobs();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
