-- Hardening: uso/custo real por pipeline (AiUsage) + trilha de auditoria (AuditLog).
-- Idempotente.

CREATE TABLE IF NOT EXISTS "AiUsage" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "pipeline"  TEXT NOT NULL,
  "model"     TEXT,
  "tokensIn"  INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "costUsd"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiUsage_clientId_createdAt_idx" ON "AiUsage"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiUsage_clientId_pipeline_createdAt_idx" ON "AiUsage"("clientId", "pipeline", "createdAt");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT,
  "userId"    TEXT,
  "action"    TEXT NOT NULL,
  "target"    TEXT,
  "meta"      JSONB,
  "ip"        TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_clientId_createdAt_idx" ON "AuditLog"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
