-- Modo Operador: números da triagem que recebem as fichas + carimbo de entrega. Idempotente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "operatorNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "fichaSentAt" TIMESTAMP(3);
