-- Sprint 3 (Intelligence Layer): classificação semântica por mensagem (intent +
-- sentiment) e objeções com ciclo de vida. Tabelas (analytics > JSON). Idempotente.

ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "lastSentiment" TEXT;

CREATE TABLE IF NOT EXISTS "MessageAnalysis" (
  "id"                  TEXT NOT NULL,
  "clientId"            TEXT NOT NULL,
  "connectionId"        TEXT NOT NULL,
  "contactId"           TEXT NOT NULL,
  "waMessageId"         TEXT NOT NULL,
  "intent"              TEXT,
  "intentConfidence"    DOUBLE PRECISION,
  "sentiment"           TEXT,
  "sentimentConfidence" DOUBLE PRECISION,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAnalysis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MessageAnalysis_waMessageId_key" ON "MessageAnalysis"("waMessageId");
CREATE INDEX IF NOT EXISTS "MessageAnalysis_clientId_createdAt_idx" ON "MessageAnalysis"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "MessageAnalysis_clientId_intent_idx" ON "MessageAnalysis"("clientId", "intent");
CREATE INDEX IF NOT EXISTS "MessageAnalysis_clientId_sentiment_idx" ON "MessageAnalysis"("clientId", "sentiment");
CREATE INDEX IF NOT EXISTS "MessageAnalysis_contactId_createdAt_idx" ON "MessageAnalysis"("contactId", "createdAt");

CREATE TABLE IF NOT EXISTS "LeadObjection" (
  "id"           TEXT NOT NULL,
  "clientId"     TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "contactId"    TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "severity"     DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "resolved"     BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt"   TIMESTAMP(3),
  "raisedMsgId"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadObjection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadObjection_clientId_type_idx" ON "LeadObjection"("clientId", "type");
CREATE INDEX IF NOT EXISTS "LeadObjection_clientId_resolved_idx" ON "LeadObjection"("clientId", "resolved");
CREATE INDEX IF NOT EXISTS "LeadObjection_contactId_resolved_idx" ON "LeadObjection"("contactId", "resolved");
