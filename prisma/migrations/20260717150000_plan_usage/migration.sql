-- Tela de Consumo do portal: limite de atendimentos/mês do plano + custo do excedente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "monthlyLeadLimit" INTEGER;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "excessRatePerLead" DOUBLE PRECISION;
