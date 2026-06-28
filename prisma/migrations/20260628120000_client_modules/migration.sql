-- Módulos que o cliente roda (controla quais abas aparecem). Idempotente.
-- Default = todos os selecionáveis ligados, pra que clientes existentes não percam abas.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "modules" TEXT[] NOT NULL DEFAULT ARRAY['reunioes','leads','anuncios','inteligencia','ia','bot']::TEXT[];
