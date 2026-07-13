-- AlterTable
ALTER TABLE "ClientPortal" ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "requireLogin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PortalAccess" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "passwordHash" TEXT;
