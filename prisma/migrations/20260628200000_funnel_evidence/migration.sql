-- Evidência da classificação do funil (frase que justificou a etapa). Idempotente.
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "funnelEvidence" TEXT;
