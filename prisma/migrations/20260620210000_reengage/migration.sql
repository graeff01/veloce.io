-- Re-engajamento dentro da janela: carimbo da última cutucada. Idempotente.
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "reengagedAt" TIMESTAMP(3);
