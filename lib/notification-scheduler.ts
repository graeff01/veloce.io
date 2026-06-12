import { runDailyDigest, runCriticalAlerts, runEndOfDay, runTokenExpiryAlerts, runMonthlyReports } from "@/lib/notifications/run";
import { captureException } from "@/lib/observability";

// Agendador interno das notificações (sem cron externo). Iniciado no boot via
// instrumentation. A idempotência (claim por dedupeKey) garante envio único.

let started = false;
const TICK_MS = 15 * 60 * 1000;        // verifica a cada 15 min
const FIRST_DELAY_MS = 120 * 1000;     // 2 min após subir
const CRITICAL_EVERY_MS = 4 * 60 * 60 * 1000; // alertas críticos a cada ~4h
let lastCriticalAt = 0;
let lastTokenCheckDay = "";             // gate diário p/ não martelar a API da Meta

function brtNow(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3
}

async function tick(): Promise<void> {
  try {
    const b = brtNow();
    const h = b.getUTCHours();
    const dayKey = `${b.getUTCFullYear()}-${b.getUTCMonth()}-${b.getUTCDate()}`;

    // Resumo do dia: a partir das 09h BRT (claim garante 1x/dia).
    if (h >= 9 && h < 23) await runDailyDigest();

    // Token Meta expirando/inválido: 1x por dia (gate evita martelar a Meta).
    if (h >= 9 && lastTokenCheckDay !== dayKey) {
      lastTokenCheckDay = dayKey;
      await runTokenExpiryAlerts();
    }

    // Relatórios mensais: dia 1, a partir das 09h (claim garante 1x/mês).
    if (b.getUTCDate() === 1 && h >= 9) await runMonthlyReports();

    // Resumo de fim de dia: a partir das 18h BRT (claim garante 1x/dia).
    if (h >= 18 && h < 23) await runEndOfDay();

    // Alertas críticos de mídia: a cada ~4h.
    if (Date.now() - lastCriticalAt >= CRITICAL_EVERY_MS) {
      lastCriticalAt = Date.now();
      await runCriticalAlerts();
    }
  } catch (e) {
    captureException(e, { where: "notif-scheduler.tick" });
  }
}

export function startNotificationScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => { void tick(); }, FIRST_DELAY_MS);
  setInterval(() => { void tick(); }, TICK_MS);
  console.log("[notif-scheduler] agendado (resumo 09h, fim de dia 18h, token+mensal, alertas a cada 4h)");
}
