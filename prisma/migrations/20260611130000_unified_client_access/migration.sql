-- Unificação de acesso: papel CLIENT + vínculo User↔Client.
-- IDEMPOTENTE e seguro para re-aplicação (deploy travado/parcial não quebra).

-- 1) Novo valor no enum Role (IF NOT EXISTS — re-rodável).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT';

-- 2) Coluna de vínculo (IF NOT EXISTS — não falha se já existir).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

-- 3) FK só se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_clientId_fkey') THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 4) Índice (IF NOT EXISTS — re-rodável).
CREATE INDEX IF NOT EXISTS "User_clientId_idx" ON "User"("clientId");
