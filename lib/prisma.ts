import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
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
const TENANT_MODELS = new Set(["Visit", "AiInteraction", "CatalogItem", "KnowledgeChunk", "AiAgentConfig", "VisitConfig", "PricingConfig", "Quote", "Handoff", "LeadMemory"]);
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
