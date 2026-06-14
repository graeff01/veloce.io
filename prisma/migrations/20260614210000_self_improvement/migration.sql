-- Sprint 4 (Self-Improvement): avaliação de resposta + AI judge, variantes de prompt
-- (A/B) e revisão humana amostral. Tabelas (analytics). Idempotente.

ALTER TABLE "AiInteraction" ADD COLUMN IF NOT EXISTS "promptVariant" TEXT;

CREATE TABLE IF NOT EXISTS "AiResponseEvaluation" (
  "id"               TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "contactId"        TEXT NOT NULL,
  "waMessageId"      TEXT,
  "overall"          DOUBLE PRECISION NOT NULL,
  "naturalness"      DOUBLE PRECISION,
  "empathy"          DOUBLE PRECISION,
  "clarity"          DOUBLE PRECISION,
  "persuasion"       DOUBLE PRECISION,
  "qualification"    DOUBLE PRECISION,
  "conversationFlow" DOUBLE PRECISION,
  "category"         TEXT NOT NULL,
  "suggestion"       TEXT,
  "severity"         DOUBLE PRECISION,
  "promptVersion"    TEXT,
  "promptVariant"    TEXT,
  "model"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiResponseEvaluation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiResponseEvaluation_clientId_createdAt_idx" ON "AiResponseEvaluation"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiResponseEvaluation_clientId_category_idx" ON "AiResponseEvaluation"("clientId", "category");
CREATE INDEX IF NOT EXISTS "AiResponseEvaluation_clientId_promptVariant_idx" ON "AiResponseEvaluation"("clientId", "promptVariant");

CREATE TABLE IF NOT EXISTS "PromptVariant" (
  "id"                TEXT NOT NULL,
  "clientId"          TEXT NOT NULL,
  "key"               TEXT NOT NULL,
  "label"             TEXT,
  "active"            BOOLEAN NOT NULL DEFAULT true,
  "weight"            INTEGER NOT NULL DEFAULT 1,
  "personaOverride"   TEXT,
  "goalsOverride"     TEXT,
  "rulesOverride"     TEXT,
  "extraInstructions" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromptVariant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromptVariant_clientId_key_key" ON "PromptVariant"("clientId", "key");
CREATE INDEX IF NOT EXISTS "PromptVariant_clientId_active_idx" ON "PromptVariant"("clientId", "active");

CREATE TABLE IF NOT EXISTS "HumanReview" (
  "id"                TEXT NOT NULL,
  "clientId"          TEXT NOT NULL,
  "contactId"         TEXT NOT NULL,
  "waMessageId"       TEXT,
  "leadMessage"       TEXT,
  "aiMessage"         TEXT,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "goodResponse"      BOOLEAN,
  "natural"           BOOLEAN,
  "seemedBot"         BOOLEAN,
  "missedOpportunity" BOOLEAN,
  "manualScore"       INTEGER,
  "reviewerId"        TEXT,
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"        TIMESTAMP(3),
  CONSTRAINT "HumanReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HumanReview_clientId_status_idx" ON "HumanReview"("clientId", "status");
