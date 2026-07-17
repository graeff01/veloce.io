-- "Clonar o melhor vendedor": DNA de venda destilado das conversas que fecharam.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "salesDna" TEXT;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "salesDnaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "salesDnaAt" TIMESTAMP(3);
