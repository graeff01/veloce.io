-- Saudação fixa configurável por loja (1ª mensagem). Idempotente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "greetingMessage" TEXT;
