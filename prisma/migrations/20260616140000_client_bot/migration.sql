-- Bot do Telegram por cliente (marca branca) + destinatários + tokens de convite. Idempotente.

CREATE TABLE IF NOT EXISTS "ClientBot" (
  "clientId"      TEXT NOT NULL,
  "token"         TEXT NOT NULL,
  "username"      TEXT NOT NULL,
  "webhookSecret" TEXT NOT NULL,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "novoLead"      BOOLEAN NOT NULL DEFAULT true,
  "slaAlerts"     BOOLEAN NOT NULL DEFAULT true,
  "leadQuente"    BOOLEAN NOT NULL DEFAULT true,
  "leadEsfriando" BOOLEAN NOT NULL DEFAULT true,
  "resumoDiario"  BOOLEAN NOT NULL DEFAULT true,
  "quietStart"    TEXT,
  "quietEnd"      TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientBot_pkey" PRIMARY KEY ("clientId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientBot_webhookSecret_key" ON "ClientBot"("webhookSecret");

CREATE TABLE IF NOT EXISTS "ClientBotRecipient" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "chatId"    TEXT NOT NULL,
  "username"  TEXT,
  "role"      TEXT NOT NULL DEFAULT 'corretor',
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientBotRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientBotRecipient_clientId_chatId_key" ON "ClientBotRecipient"("clientId", "chatId");
CREATE INDEX IF NOT EXISTS "ClientBotRecipient_clientId_idx" ON "ClientBotRecipient"("clientId");

CREATE TABLE IF NOT EXISTS "ClientBotLinkToken" (
  "token"     TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "role"      TEXT NOT NULL DEFAULT 'corretor',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientBotLinkToken_pkey" PRIMARY KEY ("token")
);
