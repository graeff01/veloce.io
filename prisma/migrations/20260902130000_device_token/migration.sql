-- Aparelhos iOS do app do Portal do Cliente (transporte APNs).
-- ADITIVA e IDEMPOTENTE: PortalPushSubscription (Web Push do PWA) não é tocada.
-- NÃO APLICADA em nenhum banco por esta implementação.

CREATE TABLE IF NOT EXISTS "DeviceToken" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ios',
    "environment" TEXT NOT NULL DEFAULT 'production',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX IF NOT EXISTS "DeviceToken_clientId_idx" ON "DeviceToken"("clientId");
CREATE INDEX IF NOT EXISTS "DeviceToken_clientId_email_idx" ON "DeviceToken"("clientId", "email");
CREATE INDEX IF NOT EXISTS "DeviceToken_deviceId_idx" ON "DeviceToken"("deviceId");
