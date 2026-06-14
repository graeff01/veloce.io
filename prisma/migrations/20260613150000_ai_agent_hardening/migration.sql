-- Solidificação do Veloce AI Agent: opt-out (LGPD), takeover humano, kill-switch
-- por cliente, escopo, teto de custo por cliente, fila durável. Tudo idempotente.

-- Opt-out do lead (não receber mensagens automáticas).
ALTER TABLE "WaContact" ADD COLUMN IF NOT EXISTS "aiOptedOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WaContact" ADD COLUMN IF NOT EXISTS "aiOptedOutAt" TIMESTAMP(3);

-- Distinguir saída da IA de resposta humana (necessário p/ detectar takeover).
ALTER TABLE "WaMessage" ADD COLUMN IF NOT EXISTS "aiGenerated" BOOLEAN NOT NULL DEFAULT false;

-- Controles de segurança/operação por cliente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "pausedReason" TEXT;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "dailyUsdCap" DOUBLE PRECISION;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "humanTakeoverMin" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "scopeMode" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "disclosureEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Fila durável do agente (1 job ativo por contato).
CREATE TABLE IF NOT EXISTS "AiJob" (
  "id"             TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "connectionId"   TEXT NOT NULL,
  "contactId"      TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "payload"        JSONB,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "runAfter"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt"       TIMESTAMP(3),
  "lastError"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiJob_contactId_key" ON "AiJob"("contactId");
CREATE INDEX IF NOT EXISTS "AiJob_status_runAfter_idx" ON "AiJob"("status", "runAfter");
