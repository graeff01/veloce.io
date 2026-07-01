-- Retry idempotente: cacheia a resposta gerada no job p/ reenviar sem re-gerar. Idempotente.
ALTER TABLE "AiJob" ADD COLUMN IF NOT EXISTS "generatedReply" TEXT;
