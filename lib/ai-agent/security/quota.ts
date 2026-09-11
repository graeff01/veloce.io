// ── Camada de segurança · Anel 0: quotas e rate limiting ──────────────────────
// Janela fixa com contador atômico no Postgres (RateBucket) + espelho em memória.
//
// Por que no banco e não só em memória: hoje o sistema tem SEIS controles guardados
// em Map de processo (login, anti-flood, semáforo, breaker, blocklist, teto de gasto).
// Com a segunda instância todos afrouxam ao mesmo tempo, em silêncio. Aqui o contador
// é do banco desde o dia 1 — trocar por Redis depois é trocar driver, não desenho.
//
// FAIL-OPEN em erro de infraestrutura (banco fora, migração não aplicada): cai no
// contador em memória. Nunca recusa atendimento por falha do próprio controle.

import { prismaUnscoped } from "@/lib/prisma";

export interface QuotaDecision {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterMs: number;
  degraded: boolean; // true = contou em memória (banco indisponível)
}

// ── Núcleo PURO (testável) ────────────────────────────────────────────────────

export function windowStartOf(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function bucketKey(scope: string, key: string, now: number, windowMs: number): string {
  return `${scope}:${key}:${windowStartOf(now, windowMs)}`;
}

/** Contador de janela fixa em memória — fallback e espelho do contador do banco. */
export class MemoryCounter {
  private map = new Map<string, { count: number; exp: number }>();
  private lastSweep = 0;

  hit(key: string, exp: number, now: number): number {
    this.sweep(now);
    const cur = this.map.get(key);
    if (!cur || cur.exp <= now) { this.map.set(key, { count: 1, exp }); return 1; }
    cur.count++;
    return cur.count;
  }

  peek(key: string, now: number): number {
    const cur = this.map.get(key);
    return cur && cur.exp > now ? cur.count : 0;
  }

  /** Remove entradas vencidas — evita o vazamento de memória dos Maps atuais. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.map) if (v.exp <= now) this.map.delete(k);
  }

  get size(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
}

// ── Implementação com persistência ────────────────────────────────────────────

const memory = new MemoryCounter();

export async function consume(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<QuotaDecision> {
  const start = windowStartOf(now, windowMs);
  const bkey = `${scope}:${key}:${start}`;
  const expiresAt = new Date(start + windowMs);
  const retryAfterMs = start + windowMs - now;

  // Curto-circuito: se o espelho local já sabe que estourou nesta janela, não vai ao
  // banco. Protege o Postgres exatamente quando o abuso está acontecendo.
  if (memory.peek(bkey, now) > limit) {
    return { allowed: false, count: memory.peek(bkey, now), limit, retryAfterMs, degraded: false };
  }

  try {
    const row = await prismaUnscoped.rateBucket.upsert({
      where: { key: bkey },
      create: { key: bkey, scope, count: 1, expiresAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    memory.hit(bkey, start + windowMs, now); // mantém o espelho aquecido
    return { allowed: row.count <= limit, count: row.count, limit, retryAfterMs, degraded: false };
  } catch {
    const count = memory.hit(bkey, start + windowMs, now);
    return { allowed: count <= limit, count, limit, retryAfterMs, degraded: true };
  }
}

/** Consulta sem consumir (para decisões que não devem gastar cota). */
export function peekLocal(scope: string, key: string, windowMs: number, now = Date.now()): number {
  return memory.peek(`${scope}:${key}:${windowStartOf(now, windowMs)}`, now);
}

// ── Tetos padrão (todos ajustáveis por env) ───────────────────────────────────
// Calibrados MUITO acima do uso real: a conversa mediana tem 6-15 turnos no total,
// e uma loja movimentada recebe dezenas de mensagens por minuto — não milhares.

const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export const LIMITS = {
  // Anel 0 — ingestão
  webhookPerConnection: { limit: num(process.env.SEC_RL_WEBHOOK_CONN, 600), windowMs: 60_000 },
  inboundPerContact: { limit: num(process.env.SEC_RL_INBOUND_CONTACT, 40), windowMs: 10 * 60_000 },
  // Anel 0 — admissão do agente (turnos de IA, que é o que custa)
  agentTurnsPerContactHour: { limit: num(process.env.SEC_RL_TURNS_CONTACT_H, 25), windowMs: 3_600_000 },
  agentTurnsPerClientHour: { limit: num(process.env.SEC_RL_TURNS_CLIENT_H, 600), windowMs: 3_600_000 },
  // Portal
  portalRequests: { limit: num(process.env.SEC_RL_PORTAL, 240), windowMs: 60_000 },
  portalLlm: { limit: num(process.env.SEC_RL_PORTAL_LLM, 15), windowMs: 60_000 },
  portalLoginPerIdentity: { limit: num(process.env.SEC_RL_LOGIN_ID, 8), windowMs: 15 * 60_000 },
  portalLoginPerIp: { limit: num(process.env.SEC_RL_LOGIN_IP, 30), windowMs: 15 * 60_000 },
  portalRegisterPerIp: { limit: num(process.env.SEC_RL_REGISTER_IP, 5), windowMs: 60 * 60_000 },
  portalStream: { limit: num(process.env.SEC_RL_STREAM, 12), windowMs: 60_000 },
} as const;

/** IP do cliente atrás do proxy do Railway (best-effort; usado só como chave de cota). */
export function clientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 45);
  return h.get("x-real-ip")?.slice(0, 45) || "unknown";
}
