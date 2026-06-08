-- Fundação Final Pré-N2: desacoplamento por vertical, rastreabilidade e idempotência.

-- 2. Desacoplamento do segmento (guardrail/regras por tenant/vertical)
ALTER TABLE "AiAgentConfig" ADD COLUMN "vertical" TEXT NOT NULL DEFAULT 'automotivo';
ALTER TABLE "AiAgentConfig" ADD COLUMN "blockedTopics" JSONB NOT NULL DEFAULT '[]';

-- 4. Versionamento de prompt + rastreabilidade do contexto (RAG)
ALTER TABLE "AiInteraction" ADD COLUMN "promptVersion" TEXT;
ALTER TABLE "AiInteraction" ADD COLUMN "contextUsed" JSONB;

-- 5. Contrato de idempotência (preparo p/ fila durável futura)
ALTER TABLE "AiInteraction" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "AiInteraction_clientId_idempotencyKey_key" ON "AiInteraction"("clientId", "idempotencyKey");
