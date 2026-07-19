-- Abas que cada atendente pode ver (por usuário). NULL = herda todas as abas do
-- cliente (comportamento dos usuários já existentes, sem regressão). Vendedores
-- novos passam a nascer com "" (só Conversas) via registerUser.
ALTER TABLE "PortalAccess" ADD COLUMN IF NOT EXISTS "sections" TEXT;
