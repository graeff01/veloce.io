import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { buildCriticalAlerts } from "@/lib/notifications/digest";
import { claim, dispatchToUser, recipientsFor } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";

// Cron de ALERTAS CRÍTICOS. Aponte um agendador algumas vezes ao dia (ex.: a cada
// 4h). A idempotência (dedupeKey por cliente+alerta+dia+usuário) impede repetir.
//   curl -X POST https://<app>/api/cron/critical-alerts -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;

  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return NextResponse.json({ sent: 0 });

  const alerts = await buildCriticalAlerts();
  if (alerts.length === 0) return NextResponse.json({ sent: 0, alerts: 0 });

  let sent = 0;
  for (const r of recipients) {
    for (const a of alerts) {
      const ok = await claim(`${a.dedupeKey}:${r.userId}`, r.userId, "critical_alert");
      if (!ok) continue; // este usuário já recebeu este alerta hoje
      const title = `🚨 ${a.clientName}`;
      const body = `${a.insight.title} — ${a.insight.detail}`;
      const tgText = `<b>🚨 ${a.clientName}</b>\n${a.insight.title}\n${a.insight.detail}`;
      await dispatchToUser(r.userId, { title, body, url: "/clients" }, tgText, r);
      sent++;
    }
  }

  return NextResponse.json({ sent, alerts: alerts.length, recipients: recipients.length });
}
