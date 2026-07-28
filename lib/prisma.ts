import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaPgPool: Pool | undefined;
}

// ── Pool do Postgres ─────────────────────────────────────────────────────────
// O `max` DEFAULT do `pg` é 10 — baixo p/ picos de atendimento concorrente: webhook
// (ingestão), jobs do agente, os crons e o cockpit dividem o MESMO pool. Sob rajada
// isso vira fila de conexão e timeout. Configurável por env; `connectionTimeoutMillis`
// faz FALHAR RÁPIDO com erro claro sob exaustão, em vez de pendurar o request esperando.
// SIZING (medido em scripts/load-test.ts): 15 webhooks SIMULTÂNEOS de ingestão pedem
// ~33 conexões no pico — cada mensagem faz fan-out de tarefas fire-and-forget (funil,
// notificações, enqueue) que abrem conexões em paralelo. Com o agente LIGADO, os jobs
// (GLOBAL_MAX=8) somam mais. Default 40 cobre esse alvo com folga.
// ATENÇÃO: DB_POOL_MAX × nº de instâncias deve ficar abaixo do `max_connections` do
// Postgres (cheque com `SHOW max_connections;`); se o plano for pequeno, baixe o valor
// e aceite alguma fila (o connectionTimeout faz esperar, não estourar).
const DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 40);
const DB_POOL_CONN_TIMEOUT_MS = Number(process.env.DB_POOL_CONN_TIMEOUT_MS || 10_000);
const DB_POOL_IDLE_TIMEOUT_MS = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30_000);

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: DB_POOL_MAX,
    connectionTimeoutMillis: DB_POOL_CONN_TIMEOUT_MS,
    idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT_MS,
  });
}

const pool = global.prismaPgPool ?? createPool();
if (process.env.NODE_ENV !== "production") global.prismaPgPool = pool;

// Saturação do pool p/ o /api/health observar em produção (fila > 0 = gargalo).
export function getPoolStats() {
  return { max: DB_POOL_MAX, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}

function createPrismaClient() {
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const base = global.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") global.prisma = base;

// ── Isolamento multi-tenant FORÇADO (não por convenção) ──────────────────────
// Modelos cujo acesso DEVE ser escopado por clientId. Operações de leitura/lote
// sem `where.clientId` lançam erro — impedindo vazamento entre clientes por um
// filtro esquecido. Queries legitimamente globais usam `prismaUnscoped` (explícito).
const TENANT_MODELS = new Set(["Visit", "AiInteraction", "CatalogItem", "KnowledgeChunk", "AiAgentConfig", "VisitConfig", "PricingConfig", "Quote"]);
const ENFORCED_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "deleteMany"]);

// Acesso direto (sem guard) para casos globais documentados (ex: breaker de gasto).
export const prismaUnscoped = base;

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model && TENANT_MODELS.has(model) && ENFORCED_OPS.has(operation)) {
          const where = (args as { where?: { clientId?: unknown } } | undefined)?.where;
          const ok = where && where.clientId !== undefined && where.clientId !== null && where.clientId !== "";
          if (!ok) throw new Error(`Tenant guard: ${model}.${operation} sem clientId no where (isolamento multi-tenant)`);
        }
        return query(args);
      },
    },
  },
});
