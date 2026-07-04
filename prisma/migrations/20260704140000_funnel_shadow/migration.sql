-- Shadow do classificador de funil (LLM lê contexto). Log append-only; nunca toca
-- WaConversation.funnelStage. Serve para validar o motor novo antes de ligar de vez.
CREATE TABLE IF NOT EXISTS "FunnelShadow" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "currentStage" TEXT,
  "proposedStage" TEXT,
  "llmStage" TEXT,
  "confidence" INTEGER,
  "evidence" TEXT,
  "signals" JSONB,
  "source" TEXT NOT NULL,
  "wouldChange" BOOLEAN NOT NULL DEFAULT false,
  "gatedByConf" BOOLEAN NOT NULL DEFAULT false,
  "review" BOOLEAN NOT NULL DEFAULT false,
  "lexiconTriggered" BOOLEAN NOT NULL DEFAULT false,
  "latencyMs" INTEGER,
  "tokensIn" INTEGER,
  "tokensOut" INTEGER,
  "costUsd" DOUBLE PRECISION,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FunnelShadow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FunnelShadow_connectionId_createdAt_idx" ON "FunnelShadow"("connectionId", "createdAt");
CREATE INDEX IF NOT EXISTS "FunnelShadow_contactId_createdAt_idx" ON "FunnelShadow"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "FunnelShadow_clientId_wouldChange_idx" ON "FunnelShadow"("clientId", "wouldChange");
