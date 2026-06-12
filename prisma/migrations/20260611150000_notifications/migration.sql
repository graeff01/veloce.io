-- Notificações (Web Push + Telegram). Idempotente.

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "endpoint"     TEXT NOT NULL,
  "p256dh"       TEXT NOT NULL,
  "auth"         TEXT NOT NULL,
  "userAgent"    TEXT,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

CREATE TABLE IF NOT EXISTS "TelegramLink" (
  "id"       TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "chatId"   TEXT NOT NULL,
  "username" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramLink_userId_key" ON "TelegramLink"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramLink_chatId_key" ON "TelegramLink"("chatId");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "userId"          TEXT NOT NULL,
  "dailyDigest"     BOOLEAN NOT NULL DEFAULT false,
  "criticalAlerts"  BOOLEAN NOT NULL DEFAULT false,
  "pushEnabled"     BOOLEAN NOT NULL DEFAULT true,
  "telegramEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "channel"   TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'sent',
  "error"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");
CREATE INDEX IF NOT EXISTS "NotificationLog_userId_createdAt_idx" ON "NotificationLog"("userId", "createdAt");

-- FKs (guardadas para idempotência).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey') THEN
    ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TelegramLink_userId_fkey') THEN
    ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_userId_fkey') THEN
    ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
