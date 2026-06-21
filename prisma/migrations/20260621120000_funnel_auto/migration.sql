-- Auto-classificação do funil: trava manual por conversa.
-- Quando o operador define a etapa, funnelManual=true e o classificador automático
-- (determinístico, roda no webhook, sem custo) deixa de tocar nessa conversa.
-- Aditivo e idempotente.

ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "funnelManual" BOOLEAN NOT NULL DEFAULT false;
