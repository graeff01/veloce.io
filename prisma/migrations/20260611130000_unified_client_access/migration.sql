-- Unificação de acesso: papel CLIENT + vínculo User↔Client.
-- O usuário CLIENT é travado a um único cliente (acesso executivo).

-- 1) Novo valor no enum Role (Postgres 12+ permite ADD VALUE em transação;
--    não usamos o valor nesta mesma migração, então é seguro).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT';

-- 2) Vínculo opcional do usuário com um cliente.
ALTER TABLE "User" ADD COLUMN "clientId" TEXT;

-- 3) FK + índice.
ALTER TABLE "User"
  ADD CONSTRAINT "User_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "User_clientId_idx" ON "User"("clientId");
