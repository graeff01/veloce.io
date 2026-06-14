// ── Hardening: proteção contra rate limit da OpenAI ───────────────────────────
// Concorrência global + por tenant (evita 1 cliente monopolizar/estourar TPM) e um
// circuit breaker (falha rápido quando a OpenAI está degradada, em vez de empilhar
// chamadas e piorar). Tudo em memória por instância — suficiente p/ Railway 1-2 nós.

const GLOBAL_MAX = Number(process.env.AI_LLM_MAX_CONCURRENCY || 8);
const TENANT_MAX = Number(process.env.AI_LLM_MAX_PER_TENANT || 3);
const BREAKER_THRESHOLD = Number(process.env.AI_LLM_BREAKER_FAILS || 6);
const BREAKER_COOLDOWN_MS = Number(process.env.AI_LLM_BREAKER_COOLDOWN_MS || 30_000);

class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return; }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// Circuit breaker determinístico (now injetável) — testável.
export class CircuitBreaker {
  private fails = 0;
  private openUntil = 0;
  constructor(private threshold = BREAKER_THRESHOLD, private cooldownMs = BREAKER_COOLDOWN_MS) {}
  canPass(now = Date.now()): boolean { return now >= this.openUntil; }
  recordSuccess(): void { this.fails = 0; this.openUntil = 0; }
  recordFailure(now = Date.now()): void {
    this.fails++;
    if (this.fails >= this.threshold) this.openUntil = now + this.cooldownMs;
  }
  get isOpen(): boolean { return !this.canPass(); }
}

const globalSem = new Semaphore(GLOBAL_MAX);
const tenantSems = new Map<string, Semaphore>();
const breaker = new CircuitBreaker();

function tenantSem(key: string): Semaphore {
  let s = tenantSems.get(key);
  if (!s) { s = new Semaphore(TENANT_MAX); tenantSems.set(key, s); }
  return s;
}

export class LLMUnavailableError extends Error {}

// Executa fn sob os limites. Falha rápido se o breaker estiver aberto.
export async function withLLMLimits<T>(tenantKey: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (breaker.isOpen) throw new LLMUnavailableError("LLM circuit aberto (degradação recente)");
  const tSem = tenantKey ? tenantSem(tenantKey) : null;
  await globalSem.acquire();
  if (tSem) await tSem.acquire();
  try {
    const r = await fn();
    breaker.recordSuccess();
    return r;
  } catch (e) {
    // Conta como falha do circuito apenas erros de servidor/limite (não erros de input).
    const msg = String(e);
    if (/\b(429|500|502|503|504|ETIMEDOUT|ECONNRESET|fetch failed)\b/i.test(msg)) breaker.recordFailure();
    throw e;
  } finally {
    if (tSem) tSem.release();
    globalSem.release();
  }
}
