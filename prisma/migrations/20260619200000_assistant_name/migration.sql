-- Nome da assistente (humanização do atendimento). Idempotente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "assistantName" TEXT;
