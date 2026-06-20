-- URL de origem do estoque por cliente (re-sync diário do catálogo). Idempotente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "catalogSourceUrl" TEXT;
