import { buildDailyDigest, buildCriticalAlerts, buildPendingLeadAlerts } from "@/lib/notifications/digest";
import { claim, dispatchToUser, recipientsFor } from "@/lib/notifications/dispatch";

// Lógica de envio reutilizada pelas rotas de cron E pelo agendador interno.
// A idempotência (claim por dedupeKey) garante envio único, não importa quantas
// vezes seja chamada.

export async function runDailyDigest(): Promise<{ sent: number; recipients: number }> {
  const recipients = await recipientsFor("dailyDigest");
  if (recipients.length === 0) return { sent: 0, recipients: 0 };

  const digest = await buildDailyDigest();
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tgText = `<b>${digest.title}</b>\n${digest.body}`;

  let sent = 0;
  for (const r of recipients) {
    const ok = await claim(`digest:${day}:${r.userId}`, r.userId, "daily_digest");
    if (!ok) continue;
    await dispatchToUser(r.userId, { title: digest.title, body: digest.body, url: digest.url }, tgText, r);
    sent++;
  }
  return { sent, recipients: recipients.length };
}

export async function runCriticalAlerts(): Promise<{ sent: number; alerts: number; recipients: number }> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0, alerts: 0, recipients: 0 };

  const alerts = await buildCriticalAlerts();
  if (alerts.length === 0) return { sent: 0, alerts: 0, recipients: recipients.length };

  let sent = 0;
  for (const r of recipients) {
    for (const a of alerts) {
      const ok = await claim(`${a.dedupeKey}:${r.userId}`, r.userId, "critical_alert");
      if (!ok) continue;
      const title = `🚨 ${a.clientName}`;
      const body = `${a.insight.title} — ${a.insight.detail}`;
      const tgText = `<b>🚨 ${a.clientName}</b>\n${a.insight.title}\n${a.insight.detail}`;
      await dispatchToUser(r.userId, { title, body, url: "/clients" }, tgText, r);
      sent++;
    }
  }
  return { sent, alerts: alerts.length, recipients: recipients.length };
}

// Alerta intraday: leads aguardando resposta há +2h (usa a pref de alertas críticos).
export async function runPendingLeadAlerts(): Promise<{ sent: number; leads: number }> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0, leads: 0 };

  const leads = await buildPendingLeadAlerts();
  if (leads.length === 0) return { sent: 0, leads: 0 };

  let sent = 0;
  for (const r of recipients) {
    for (const l of leads) {
      const ok = await claim(`${l.dedupeKey}:${r.userId}`, r.userId, "lead_waiting");
      if (!ok) continue;
      const title = `💬 Lead sem resposta — ${l.clientName}`;
      const body = `${l.contactName} aguardando há ${l.waitingHours}h. Responda para não perder.`;
      const tg = `<b>💬 Lead sem resposta — ${l.clientName}</b>\n${l.contactName} aguardando há ${l.waitingHours}h.`;
      await dispatchToUser(r.userId, { title, body, url: "/clients" }, tg, r);
      sent++;
    }
  }
  return { sent, leads: leads.length };
}
