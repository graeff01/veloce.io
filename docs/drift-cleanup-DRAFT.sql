-- ============================================================================
-- RASCUNHO — LIMPEZA DE DRIFT (schema.prisma × banco de produção)   NÃO APLICAR
-- ============================================================================
-- Gerado por: prisma migrate diff --from-config-datasource --to-schema --script
-- Data: 2026-07-09   |   Servidor: PostgreSQL 18.4
--
-- O QUE É: alinha o banco de produção ao schema.prisma atual, removendo objetos
-- ABANDONADOS que sobraram do revert do "portal do cliente" (commit deaa9cf) e de
-- refactors antigos, cujas migrations de descida nunca foram criadas/aplicadas.
--
-- ⚠️ NÃO RODAR COMO ESTÁ. É DESTRUTIVO e precisa de revisão humana + janela + backup.
--
-- DESTRUTIVO (apaga dados de verdade):
--   • DROP TABLE CustomerPortalCredential, PortalAccessLog  (dados do portal revertido)
--   • ALTER TABLE User  DROP COLUMN clientId                (CONFIRMAR: dado morto?)
--   • ALTER TABLE Client DROP COLUMN portalEnabled
--   • DROP INDEX User_clientId_idx, WaLead_connectionId_adModel_idx
--
-- 🚩 LANDMINE do enum Role: o bloco abaixo estreita Role para (ADMIN,OPERATIONAL,DESIGNER).
--    Se QUALQUER linha em User tiver role='CLIENT' (resquício do portal), o
--    `USING role::text::Role_new` FALHA e aborta tudo. Verificar ANTES:
--       SELECT DISTINCT role FROM "User";
--    Se houver 'CLIENT', decidir o remapeamento (ex.: para OPERATIONAL) antes.
--
-- RUÍDO (baixa prioridade, provavelmente inofensivo): vários
--   `ALTER COLUMN "updatedAt" DROP DEFAULT` e re-declarações de FK são artefatos de
--   representação do Prisma; incluídos aqui só porque o diff os emite.
--
-- PROCESSO recomendado: revisar item a item → confirmar intenção de cada DROP →
-- rodar SELECT de checagem do enum → aplicar em janela fora de pico com backup em mãos.
-- ============================================================================

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'OPERATIONAL', 'DESIGNER');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OPERATIONAL';
COMMIT;

-- DropForeignKey
ALTER TABLE "ContentVersion" DROP CONSTRAINT "ContentVersion_postId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerPortalCredential" DROP CONSTRAINT "CustomerPortalCredential_clientId_fkey";

-- DropForeignKey
ALTER TABLE "MetaConnection" DROP CONSTRAINT "MetaConnection_clientId_fkey";

-- DropForeignKey
ALTER TABLE "PortalAccessLog" DROP CONSTRAINT "PortalAccessLog_clientId_fkey";

-- DropForeignKey
ALTER TABLE "PortalAccessLog" DROP CONSTRAINT "PortalAccessLog_credentialId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_clientId_fkey";

-- DropIndex
DROP INDEX "User_clientId_idx";

-- DropIndex
DROP INDEX "WaLead_connectionId_adModel_idx";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "portalEnabled";

-- AlterTable
ALTER TABLE "ClientBot" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ClientBotRecipient" ALTER COLUMN "role" SET DEFAULT 'dono';

-- AlterTable
ALTER TABLE "ClientPortal" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FinanceStatusOverride" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FunnelCheck" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GoogleCampaign" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GoogleConnection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GoogleInsight" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GoogleKeyword" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GoogleSearchTerm" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Meeting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NotificationPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "WinningCampaign" ALTER COLUMN "tags" DROP DEFAULT;

-- DropTable
DROP TABLE "CustomerPortalCredential";

-- DropTable
DROP TABLE "PortalAccessLog";

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "MetaInsight_row_key" RENAME TO "MetaInsight_connectionId_campaignId_adsetId_dateStart_dateS_key";

