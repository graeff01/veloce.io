-- AlterTable
ALTER TABLE "PortalAccess" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'attendant';

-- Garante ao menos 1 admin por cliente: promove o usuário mais antigo (com senha) de
-- cada cliente que ainda não tem admin.
UPDATE "PortalAccess" pa SET "role" = 'admin'
WHERE pa."id" IN (
  SELECT DISTINCT ON (p."clientId") p."id"
  FROM "PortalAccess" p
  WHERE p."passwordHash" IS NOT NULL
  ORDER BY p."clientId", p."createdAt" ASC
);
