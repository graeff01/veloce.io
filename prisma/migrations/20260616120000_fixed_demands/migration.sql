-- Demandas fixas (recorrentes): cadastradas no Perfil do cliente e materializadas
-- como Task em "A fazer" todo início de mês (prazo até o fim do mês).
-- Aditivo e idempotente — não toca dados existentes.

CREATE TABLE IF NOT EXISTS "FixedDemand" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FixedDemand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FixedDemand_clientId_idx" ON "FixedDemand"("clientId");

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "fixedDemandId" TEXT;
CREATE INDEX IF NOT EXISTS "Task_fixedDemandId_idx" ON "Task"("fixedDemandId");

DO $$ BEGIN
  ALTER TABLE "FixedDemand" ADD CONSTRAINT "FixedDemand_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_fixedDemandId_fkey"
    FOREIGN KEY ("fixedDemandId") REFERENCES "FixedDemand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
