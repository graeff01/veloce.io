-- Auto-retry de notificações + auto-limpeza de mensagens do Telegram. Idempotente.

-- Orçamento de tentativas no log (claim/sent/failed).
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Mensagens enviadas pelo bot, para apagar após 24h.
CREATE TABLE IF NOT EXISTS "TelegramMessage" (
  "id"        TEXT NOT NULL,
  "chatId"    TEXT NOT NULL,
  "messageId" INTEGER NOT NULL,
  "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TelegramMessage_sentAt_idx" ON "TelegramMessage"("sentAt");
