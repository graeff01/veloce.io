import {
  buildDailyDigest, buildCriticalAlerts, buildEndOfDaySummary,
  buildTokenExpiryAlerts, buildMonthlyReportMessage, buildFailureAlert,
  esc, APP_URL,
} from "@/lib/notifications/digest";
import { claimDispatch, recipientsFor, MAX_ATTEMPTS } from "@/lib/notifications/dispatch";
import { nowParts } from "@/lib/tz";

const TZ = "America/Sao_Paulo";
// Dia-calendário em BRT, p/ as chaves de dedupe baterem com a janela do scheduler.
function brtDay(): string { return nowParts(TZ).ymd; }
function brtMonth(): string { return nowParts(TZ).ymd.slice(0, 7); }

// Lógica de envio reutilizada pelas rotas de cron E pelo agendador interno.
// A idempotência (claim por dedupeKey) garante envio único; um envio que falha
// é re-tentado no próximo tick (ver claimDispatch).

export async function runDailyDigest(): Promise<{ sent: number; recipients: number }> {
  const recipients = await recipientsFor("dailyDigest");
  if (recipients.length === 0) return { sent: 0, recipients: 0 };

  const digest = await buildDailyDigest();
  const day = brtDay();

  let sent = 0;
  for (const r of recipients) {
    if (await claimDispatch(`digest:${day}:${r.userId}`, r.userId, "daily_digest", { title: digest.title, body: digest.body, url: digest.url }, digest.telegram, r)) sent++;
  }
  return { sent, recipients: recipients.length };
}

export async function runEndOfDay(): Promise<{ sent: number }> {
  const recipients = await recipientsFor("dailyDigest");
  if (recipients.length === 0) return { sent: 0 };

  const eod = await buildEndOfDaySummary();
  if (!eod.hasContent) return { sent: 0 }; // dia sem leads → não envia placar vazio
  const day = brtDay();

  let sent = 0;
  for (const r of recipients) {
    if (await claimDispatch(`eod:${day}:${r.userId}`, r.userId, "end_of_day", { title: eod.title, body: eod.body, url: eod.url }, eod.telegram, r)) sent++;
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
      const tgText = `🚨 <b>${esc(a.clientName)}</b>\n\n<b>${esc(a.insight.title)}</b>\n${esc(a.insight.detail)}\n\n<a href="${APP_URL}/clients/${a.clientId}">Abrir cliente →</a>`;
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
      const emoji = a.invalid ? "🔴" : "🟡";
      const title = a.invalid ? `🔴 Token Meta inválido — ${a.clientName}` : `🟡 Token Meta expira — ${a.clientName}`;
      const body = a.invalid
        ? `O token da conta Meta de ${a.clientName} está inválido/revogado. Reconecte em Anúncios.`
        : `O token Meta de ${a.clientName} expira em ${a.daysLeft} dia(s). Renove antes de parar o sync.`;
      const tgText = `${emoji} <b>Token Meta — ${esc(a.clientName)}</b>\n${esc(body)}\n\n<a href="${APP_URL}/clients/${a.clientId}">Abrir cliente →</a>`;
      if (await claimDispatch(`${a.dedupeKey}:${r.userId}`, r.userId, "token_expiry", { title, body, url: "/clients" }, tgText, r)) sent++;
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
  const ym = brtMonth();

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
  const day = brtDay();

  let sent = 0;
  for (const r of recipients) {
    if (await claimDispatch(`health:${day}:${r.userId}`, r.userId, "failure_alert", { title: msg.title, body: msg.body, url: msg.url }, msg.telegram, r)) sent++;
  }
  return { sent };
}
