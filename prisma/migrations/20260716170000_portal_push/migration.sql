-- Web Push do vendedor do portal (alerta com o portal fechado). Separado do push interno.
CREATE TABLE IF NOT EXISTS "PortalPushSubscription" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalPushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalPushSubscription_endpoint_key" ON "PortalPushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PortalPushSubscription_clientId_idx" ON "PortalPushSubscription"("clientId");
CREATE INDEX IF NOT EXISTS "PortalPushSubscription_clientId_email_idx" ON "PortalPushSubscription"("clientId", "email");
