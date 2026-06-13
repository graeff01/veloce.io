import { runDueJobs } from "@/lib/notifications/scheduler-core";
import { captureException } from "@/lib/observability";

// Agendador interno das notificações. Iniciado no boot via instrumentation.
// A decisão "o que enviar agora" mora em scheduler-core (compartilhada com o
// cron externo /api/cron/notifications). Os gates são no banco, então rodar
// interno + cron ao mesmo tempo é seguro (idempotente).

let started = false;
const TICK_MS = 5 * 60 * 1000;     // verifica a cada 5 min
const FIRST_DELAY_MS = 30 * 1000;  // 30s após subir

export function startNotificationScheduler(): void {
  if (started) return;
  started = true;
  const tick = () => { void runDueJobs().catch((e) => captureException(e, { where: "notif-scheduler.tick" })); };
  setTimeout(tick, FIRST_DELAY_MS);
  setInterval(tick, TICK_MS);
  console.log("[notif-scheduler] agendado (5min; resumo 09h, fim de dia 18h, token+mensal+saúde, críticos ~4h, limpeza Telegram 24h)");
}
