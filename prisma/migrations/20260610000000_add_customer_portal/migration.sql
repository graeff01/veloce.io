-- AlterTable: adicionar portalEnabled ao Client
ALTER TABLE "Client" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: CustomerPortalCredential
CREATE TABLE "CustomerPortalCredential" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPortalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PortalAccessLog
CREATE TABLE "PortalAccessLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "credentialId" TEXT,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalCredential_email_key" ON "CustomerPortalCredential"("email");
CREATE INDEX "CustomerPortalCredential_clientId_idx" ON "CustomerPortalCredential"("clientId");
CREATE INDEX "PortalAccessLog_clientId_createdAt_idx" ON "PortalAccessLog"("clientId", "createdAt");
CREATE INDEX "PortalAccessLog_credentialId_createdAt_idx" ON "PortalAccessLog"("credentialId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerPortalCredential" ADD CONSTRAINT "CustomerPortalCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccessLog" ADD CONSTRAINT "PortalAccessLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccessLog" ADD CONSTRAINT "PortalAccessLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "CustomerPortalCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
