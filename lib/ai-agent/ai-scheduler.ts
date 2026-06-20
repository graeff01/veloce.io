import { processDueJobs } from "@/lib/ai-agent/queue";
import { deliverReadyToOperators } from "@/lib/ai-agent/operator";
import { captureException } from "@/lib/observability";

// Agendador interno do worker do agente. O caminho feliz é o "nudge" em memória logo
// após o debounce; este tick é a REDE DE SEGURANÇA: recolhe jobs órfãos (deploy/restart
// derrubou o nudge) ou presos por lock vencido. A fila (AiJob) é a fonte de verdade e o
// claim é atômico no banco, então rodar interno + cron externo ao mesmo tempo é seguro.

let started = false;
const TICK_MS = 60 * 1000;        // a cada 60s
const FIRST_DELAY_MS = 20 * 1000; // 20s após subir
const OPERATOR_TICK_MS = 2 * 60 * 1000; // push de fichas ao operador a cada 2min (near-real-time p/ lead quente)

export function startAiAgentScheduler(): void {
  if (started) return;
  started = true;
  const tick = () => { void processDueJobs().catch((e) => captureException(e, { where: "ai-scheduler.tick" })); };
  setTimeout(tick, FIRST_DELAY_MS);
  setInterval(tick, TICK_MS);
  // Push do modo operador (Fase 2): entrega fichas prontas a operadores com janela aberta.
  const opTick = () => { void deliverReadyToOperators().catch((e) => captureException(e, { where: "ai-scheduler.operator" })); };
  setInterval(opTick, OPERATOR_TICK_MS);
  console.log("[ai-scheduler] worker do agente agendado (60s fila + 2min push operador)");
}
