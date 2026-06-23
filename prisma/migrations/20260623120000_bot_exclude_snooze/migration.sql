-- Nomes a ignorar (exclusão de lead) + snooze por destinatário. Idempotente.

ALTER TABLE "ClientBot" ADD COLUMN IF NOT EXISTS "excludedNames" TEXT;
ALTER TABLE "ClientBotRecipient" ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP(3);
