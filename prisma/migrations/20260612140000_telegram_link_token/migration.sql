-- Token curto de vínculo do Telegram (uso único, expira). Idempotente.
CREATE TABLE IF NOT EXISTS "TelegramLinkToken" (
  "token"     TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("token")
);
