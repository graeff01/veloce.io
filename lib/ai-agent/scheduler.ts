// Debounce por conversa + lock para evitar respostas duplicadas/concorrentes.
// Em memória (assume 1 instância no Railway — para multi-instância, migrar p/ fila/Redis).

const DEBOUNCE_MS = Number(process.env.AI_AGENT_DEBOUNCE_MS || 6000);
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Set<string>();

type Runner = () => Promise<void>;

async function fire(key: string, run: Runner) {
  timers.delete(key);
  if (running.has(key)) {
    // Já há uma execução para esta conversa: re-tenta em breve (serializa).
    timers.set(key, setTimeout(() => void fire(key, run), 1500));
    return;
  }
  running.add(key);
  try { await run(); } catch { /* o runner já loga internamente */ }
  finally { running.delete(key); }
}

// Agrupa rajadas de mensagens do mesmo contato numa única execução (a última vence;
// o orquestrador lê todo o histórico, então nada se perde).
export function scheduleAgentRun(key: string, run: Runner): void {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(key, setTimeout(() => void fire(key, run), DEBOUNCE_MS));
}
