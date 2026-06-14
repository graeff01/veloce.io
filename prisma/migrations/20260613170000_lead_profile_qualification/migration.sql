-- Qualificação mais rica: a IA coleta e adianta ao vendedor os detalhes do veículo
-- da troca e das condições de financiamento pretendidas. Idempotente.

ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "tradeInDetail"   TEXT;
ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "financingDetail" TEXT;
