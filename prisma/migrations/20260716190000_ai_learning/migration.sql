-- Aprendizado com os vendedores: diário de correções + memória de cliente recorrente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "recurringMemory" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "AiCorrection" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "contactId" TEXT,
  "quoteId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'quote_rejected',
  "leadWanted" TEXT,
  "aiProposed" TEXT,
  "note" TEXT,
  "reviewerEmail" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedByEmail" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCorrection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiCorrection_clientId_resolved_createdAt_idx" ON "AiCorrection"("clientId", "resolved", "createdAt");
