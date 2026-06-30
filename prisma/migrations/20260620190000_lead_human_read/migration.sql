-- Leitura humana: uso/motivação, o que mais pesa e estágio de decisão do lead. Idempotente.
ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "usageContext" TEXT;
ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "buyingPriority" TEXT;
ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "decisionStage" TEXT;
