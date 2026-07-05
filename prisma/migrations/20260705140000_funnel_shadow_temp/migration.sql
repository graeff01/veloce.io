-- Temperatura no shadow do funil: motor novo (LLM lê contexto) vs. score determinístico.
-- Colunas nullable — nada retroativo, só passa a preencher a partir de agora.
ALTER TABLE "FunnelShadow" ADD COLUMN IF NOT EXISTS "currentTemp" TEXT;
ALTER TABLE "FunnelShadow" ADD COLUMN IF NOT EXISTS "proposedTemp" TEXT;
ALTER TABLE "FunnelShadow" ADD COLUMN IF NOT EXISTS "llmTemp" TEXT;
ALTER TABLE "FunnelShadow" ADD COLUMN IF NOT EXISTS "tempConfidence" INTEGER;
ALTER TABLE "FunnelShadow" ADD COLUMN IF NOT EXISTS "tempEvidence" TEXT;
ALTER TABLE "FunnelShadow" ADD COLUMN IF NOT EXISTS "tempWouldChange" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FunnelShadow" ADD COLUMN IF NOT EXISTS "tempGatedByConf" BOOLEAN NOT NULL DEFAULT false;
