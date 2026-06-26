-- Login do painel do cliente (OTP por e-mail). Aditivo/idempotente.

CREATE TABLE IF NOT EXISTS "PortalAccess" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalAccess_clientId_email_key" ON "PortalAccess"("clientId", "email");
CREATE INDEX IF NOT EXISTS "PortalAccess_clientId_idx" ON "PortalAccess"("clientId");

CREATE TABLE IF NOT EXISTS "PortalOtp" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PortalOtp_clientId_email_idx" ON "PortalOtp"("clientId", "email");

CREATE TABLE IF NOT EXISTS "PortalSession" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalSession_sessionToken_key" ON "PortalSession"("sessionToken");
CREATE INDEX IF NOT EXISTS "PortalSession_clientId_idx" ON "PortalSession"("clientId");
CREATE INDEX IF NOT EXISTS "PortalSession_email_idx" ON "PortalSession"("email");
