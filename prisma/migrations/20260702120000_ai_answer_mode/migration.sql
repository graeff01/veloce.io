-- Modo de atendimento da IA: só fora do horário (default) ou 24h. Idempotente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "answerMode" TEXT NOT NULL DEFAULT 'off_hours';
