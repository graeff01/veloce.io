import { runDailyDigest, runCriticalAlerts } from "@/lib/notifications/run";
import { captureException } from "@/lib/observability";

// Agendador interno das notificações (sem depender de cron externo). Iniciado no
// boot via instrumentation. A idempotência (claim por dedupeKey) garante envio
// único mesmo com reinícios ou ticks repetidos.

let started = false;
const TICK_MS = 15 * 60 * 1000;        // verifica a cada 15 min
const FIRST_DELAY_MS = 120 * 1000;     // 2 min após subir (server pronto)
const CRITICAL_EVERY_MS = 4 * 60 * 60 * 1000; // alertas críticos a cada ~4h
let lastCriticalAt = 0;

function brtHour(): number {
  return (new Date().getUTCHours() + 24 - 3) % 24; // BRT = UTC-3
}

async function tick(): Promise<void> {
  try {
    // Resumo do dia: a partir das 08h BRT (claim garante 1x por dia).
    const h = brtHour();
    if (h >= 8 && h < 23) {
      await runDailyDigest();
    }
    // Alertas críticos: a cada ~4h.
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
  console.log("[notif-scheduler] agendado (resumo 08h BRT, alertas a cada 4h)");
}
