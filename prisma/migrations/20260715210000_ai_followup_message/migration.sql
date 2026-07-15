-- Mensagem de follow-up (re-engajamento) configurável por cliente. Vazio = texto neutro.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "followUpMessage" TEXT;
