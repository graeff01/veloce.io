import {
  buildDailyDigest, buildCriticalAlerts, buildEndOfDaySummary,
  buildTokenExpiryAlerts, buildMonthlyReportMessage, buildFailureAlert,
} from "@/lib/notifications/digest";
import { claimDispatch, recipientsFor, MAX_ATTEMPTS } from "@/lib/notifications/dispatch";

// Lógica de envio reutilizada pelas rotas de cron E pelo agendador interno.
// A idempotência (claim por dedupeKey) garante envio único; um envio que falha
// é re-tentado no próximo tick (ver claimDispatch).

export async function runDailyDigest(): Promise<{ sent: number; recipients: number }> {
  const recipients = await recipientsFor("dailyDigest");
  if (recipients.length === 0) return { sent: 0, recipients: 0 };

  const digest = await buildDailyDigest();
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tgText = `<b>${digest.title}</b>\n${digest.body}`;

  let sent = 0;
  for (const r of recipients) {
    if (await claimDispatch(`digest:${day}:${r.userId}`, r.userId, "daily_digest", { title: digest.title, body: digest.body, url: digest.url }, tgText, r)) sent++;
  }
  return { sent, recipients: recipients.length };
}

export async function runEndOfDay(): Promise<{ sent: number }> {
  const recipients = await recipientsFor("dailyDigest");
  if (recipients.length === 0) return { sent: 0 };

  const eod = await buildEndOfDaySummary();
  if (!eod.hasContent) return { sent: 0 }; // dia sem leads → não envia placar vazio
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tg = `<b>${eod.title}</b>\n${eod.body}`;

  let sent = 0;
  for (const r of recipients) {
    if (await claimDispatch(`eod:${day}:${r.userId}`, r.userId, "end_of_day", { title: eod.title, body: eod.body, url: eod.url }, tg, r)) sent++;
  }
  return { sent };
}

export async function runCriticalAlerts(): Promise<{ sent: number; alerts: number; recipients: number }> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0, alerts: 0, recipients: 0 };

  const alerts = await buildCriticalAlerts();
  if (alerts.length === 0) return { sent: 0, alerts: 0, recipients: recipients.length };

  let sent = 0;
  for (const r of recipients) {
    for (const a of alerts) {
      const title = `🚨 ${a.clientName}`;
      const body = `${a.insight.title} — ${a.insight.detail}`;
      const tgText = `<b>🚨 ${a.clientName}</b>\n${a.insight.title}\n${a.insight.detail}`;
      if (await claimDispatch(`${a.dedupeKey}:${r.userId}`, r.userId, "critical_alert", { title, body, url: "/clients" }, tgText, r)) sent++;
    }
  }
  return { sent, alerts: alerts.length, recipients: recipients.length };
}

// Token Meta expirando (<=5 dias) ou inválido — usa a pref de alertas críticos.
export async function runTokenExpiryAlerts(): Promise<{ sent: number; alerts: number }> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0, alerts: 0 };

  const alerts = await buildTokenExpiryAlerts();
  if (alerts.length === 0) return { sent: 0, alerts: 0 };

  let sent = 0;
  for (const r of recipients) {
    for (const a of alerts) {
      const title = a.invalid ? `🔴 Token Meta inválido — ${a.clientName}` : `🟡 Token Meta expira — ${a.clientName}`;
      const body = a.invalid
        ? `O token da conta Meta de ${a.clientName} está inválido/revogado. Reconecte em Anúncios.`
        : `O token Meta de ${a.clientName} expira em ${a.daysLeft} dia(s). Renove antes de parar o sync.`;
      if (await claimDispatch(`${a.dedupeKey}:${r.userId}`, r.userId, "token_expiry", { title, body, url: "/clients" }, `<b>${title}</b>\n${body}`, r)) sent++;
    }
  }
  return { sent, alerts: alerts.length };
}

// Relatórios mensais (dia 1) — usa a pref de resumo diário.
export async function runMonthlyReports(): Promise<{ sent: number }> {
  const recipients = await recipientsFor("dailyDigest");
  if (recipients.length === 0) return { sent: 0 };

  const msg = await buildMonthlyReportMessage();
  if (!msg) return { sent: 0 };
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let sent = 0;
  for (const r of recipients) {
    if (await claimDispatch(`monthly:${ym}:${r.userId}`, r.userId, "monthly_report", { title: msg.title, body: msg.pushBody, url: msg.url }, msg.telegramBody, r)) sent++;
  }
  return { sent };
}

// Resumo de saúde (1x/dia) — avisa a operação quando notificações estouraram o
// orçamento de tentativas. Usa a pref de alertas críticos.
export async function runFailureAlert(): Promise<{ sent: number }> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0 };

  const msg = await buildFailureAlert(MAX_ATTEMPTS);
  if (!msg) return { sent: 0 };
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tg = `<b>${msg.title}</b>\n${msg.body}`;

  let sent = 0;
  for (const r of recipients) {
    if (await claimDispatch(`health:${day}:${r.userId}`, r.userId, "failure_alert", { title: msg.title, body: msg.body, url: msg.url }, tg, r)) sent++;
  }
  return { sent };
}
