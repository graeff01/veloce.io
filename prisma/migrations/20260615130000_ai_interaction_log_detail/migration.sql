-- Logs avançados: detalhe técnico por turno na AiInteraction.
-- Aditivo e idempotente — colunas nullable, não tocam dados existentes.
--   stages     JSONB   timeline por etapa [{name,ms}] (context|rag|llm|guardrail)
--   guardrails JSONB   guardrails acionados (string[] de motivos)
--   error      TEXT    mensagem de erro quando status='error'

ALTER TABLE "AiInteraction" ADD COLUMN IF NOT EXISTS "stages"     JSONB;
ALTER TABLE "AiInteraction" ADD COLUMN IF NOT EXISTS "guardrails" JSONB;
ALTER TABLE "AiInteraction" ADD COLUMN IF NOT EXISTS "error"      TEXT;
