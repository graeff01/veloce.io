-- Modo revisão do vendedor: o PDF do orçamento fica retido até um vendedor aprovar.
-- Blinda contra "orçamento errado" (medo nº 1 do cliente). Opt-in por cliente (JR).
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "quoteReviewEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "reviewedByEmail" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION DEFAULT 0;

-- Fila de revisão: buscar pendentes por cliente rapidamente.
CREATE INDEX IF NOT EXISTS "Quote_clientId_status_submittedAt_idx" ON "Quote"("clientId", "status", "submittedAt");
