// Roda uma vez quando o servidor sobe (Next instrumentation, estável v15+).
// Inicia jobs internos — não bloqueia o boot (apenas agenda).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMetaAutoSync } = await import("@/lib/meta-scheduler");
  startMetaAutoSync();
  const { startNotificationScheduler } = await import("@/lib/notification-scheduler");
  startNotificationScheduler();
  const { startAiAgentScheduler } = await import("@/lib/ai-agent/ai-scheduler");
  startAiAgentScheduler();
}
