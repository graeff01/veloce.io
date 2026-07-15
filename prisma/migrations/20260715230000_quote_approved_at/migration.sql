-- Cliente aprovou o orçamento (quer fechar) → alimenta a Fila de Fechamento dos vendedores.
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "quoteApprovedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WaConversation_quoteApprovedAt_idx" ON "WaConversation"("quoteApprovedAt");
