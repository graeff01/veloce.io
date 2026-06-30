import { processDueJobs } from "@/lib/ai-agent/queue";
import { reengageStalled } from "@/lib/ai-agent/reengage";
import { captureException } from "@/lib/observability";

// Agendador interno do worker do agente. O caminho feliz é o "nudge" em memória logo
// após o debounce; este tick é a REDE DE SEGURANÇA: recolhe jobs órfãos (deploy/restart
// derrubou o nudge) ou presos por lock vencido. A fila (AiJob) é a fonte de verdade e o
// claim é atômico no banco, então rodar interno + cron externo ao mesmo tempo é seguro.

let started = false;
const TICK_MS = 60 * 1000;        // a cada 60s
const FIRST_DELAY_MS = 20 * 1000; // 20s após subir
const REENGAGE_TICK_MS = 10 * 60 * 1000; // re-engajamento de lead silenciado a cada 10min

export function startAiAgentScheduler(): void {
  if (started) return;
  started = true;
  const tick = () => { void processDueJobs().catch((e) => captureException(e, { where: "ai-scheduler.tick" })); };
  setTimeout(tick, FIRST_DELAY_MS);
  setInterval(tick, TICK_MS);
  // Re-engajamento dentro da janela: recupera lead engajado que ficou em silêncio.
  const reTick = () => { void reengageStalled().catch((e) => captureException(e, { where: "ai-scheduler.reengage" })); };
  setInterval(reTick, REENGAGE_TICK_MS);
  console.log("[ai-scheduler] worker do agente agendado (60s fila + 10min re-engajamento)");
}
