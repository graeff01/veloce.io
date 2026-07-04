-- Teardown do Telegram (destrutivo). Código já 100% fora do Telegram (PRs #73/#74).

-- Remove o recipient Telegram morto antes de dropar a coluna (só sobra WhatsApp).
DELETE FROM "ClientBotRecipient" WHERE channel = 'telegram';

-- Tabelas de vínculo/convite do Telegram.
DROP TABLE IF EXISTS "TelegramLink";
DROP TABLE IF EXISTS "TelegramLinkToken";
DROP TABLE IF EXISTS "ClientBotLinkToken";

-- ClientBot: era transporte Telegram (token/username/webhook) → só config de alertas.
ALTER TABLE "ClientBot" DROP COLUMN IF EXISTS "token";
ALTER TABLE "ClientBot" DROP COLUMN IF EXISTS "username";
ALTER TABLE "ClientBot" DROP COLUMN IF EXISTS "webhookSecret";
ALTER TABLE "ClientBot" DROP COLUMN IF EXISTS "welcomeMessage";

-- ClientBotRecipient: WhatsApp-only (sem chatId/username do Telegram).
DROP INDEX IF EXISTS "ClientBotRecipient_clientId_chatId_key";
ALTER TABLE "ClientBotRecipient" DROP COLUMN IF EXISTS "chatId";
ALTER TABLE "ClientBotRecipient" DROP COLUMN IF EXISTS "username";
ALTER TABLE "ClientBotRecipient" ALTER COLUMN "channel" SET DEFAULT 'whatsapp';

-- NotificationPreference: canal Telegram removido.
ALTER TABLE "NotificationPreference" DROP COLUMN IF EXISTS "telegramEnabled";
