import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { buildDailyDigest } from "@/lib/notifications/digest";
import { claim, dispatchToUser, recipientsFor } from "@/lib/notifications/dispatch";

export const runtime = "nodejs";

// Cron do RESUMO DO DIA. Aponte um agendador (Railway Cron / cron-job.org) para
// cá pela manhã (ex.: 08:00 BRT = 11:00 UTC):
//   curl -X POST https://<app>/api/cron/daily-digest -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;

  const recipients = await recipientsFor("dailyDigest");
  if (recipients.length === 0) return NextResponse.json({ sent: 0 });

  const digest = await buildDailyDigest(); // agência (mesmo conteúdo p/ todos)
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tgText = `<b>${digest.title}</b>\n${digest.body}`;

  let sent = 0;
  for (const r of recipients) {
    const ok = await claim(`digest:${day}:${r.userId}`, r.userId, "daily_digest");
    if (!ok) continue; // já enviado hoje
    await dispatchToUser(r.userId, { title: digest.title, body: digest.body, url: digest.url }, tgText, r);
    sent++;
  }

  return NextResponse.json({ sent, recipients: recipients.length });
}
