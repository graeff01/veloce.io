import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { runDueJobs } from "@/lib/notifications/scheduler-core";
import { scanStuckNegotiations, scanMissingSaleValues } from "@/lib/notifications/funnel-check";

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
  // Frente 2: pergunta "fechou?" ao gestor (leads parados em Negociação). Best-effort.
  const funnel = await scanStuckNegotiations().catch(() => ({ created: 0, sent: 0 }));
  // Re-pergunta do valor da venda (venda confirmada sem valor há 24h). Best-effort.
  const saleValue = await scanMissingSaleValues().catch(() => ({ asked: 0, gaveUp: 0 }));
  return NextResponse.json({ ok: true, at: new Date().toISOString(), funnel, saleValue });
}
