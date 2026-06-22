-- Observações / impedimentos do designer na pauta. Aditivo/idempotente.
ALTER TABLE "ContentPost" ADD COLUMN IF NOT EXISTS "notes" TEXT;
