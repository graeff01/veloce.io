-- Marca branca do bot por cliente: nome da marca + mensagem de boas-vindas. Idempotente.

ALTER TABLE "ClientBot" ADD COLUMN IF NOT EXISTS "brandName" TEXT;
ALTER TABLE "ClientBot" ADD COLUMN IF NOT EXISTS "welcomeMessage" TEXT;
