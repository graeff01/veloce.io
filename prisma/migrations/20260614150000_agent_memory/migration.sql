-- Sprint 1 (Memory Architecture): memória rolante de trabalho da IA, separada do
-- aiSummary do CRM (evita regressão no resumo do operador). Idempotente.

ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "agentMemory"     TEXT;
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "agentMemoryUpto" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "agentMemoryAt"   TIMESTAMP(3);
