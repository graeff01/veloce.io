-- AlterTable
ALTER TABLE "ClientPortal" ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "requireLogin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PortalAccess" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- Preserva a proteção: quem já tinha e-mail autorizado (login por OTP ligado) continua
-- exigindo login. Os e-mails ficam como "convidados" (sem senha) e definem a senha no
-- 1º acesso pela tela de Criar conta. Sem isso, esses portais ficariam abertos pelo link.
UPDATE "ClientPortal" cp SET "requireLogin" = true
WHERE EXISTS (SELECT 1 FROM "PortalAccess" pa WHERE pa."clientId" = cp."clientId");
