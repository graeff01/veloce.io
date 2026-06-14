-- Modo canário (responder só números de teste), silenciar IA por contato (operador
-- assume manualmente) e base para retenção/exclusão LGPD. Idempotente.

ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "testMode"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "testNumbers" JSONB   NOT NULL DEFAULT '[]';

ALTER TABLE "WaContact" ADD COLUMN IF NOT EXISTS "aiSilenced" BOOLEAN NOT NULL DEFAULT false;
