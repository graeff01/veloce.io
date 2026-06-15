-- Notificação em tempo real quando um lead manda mensagem (opt-in por usuário).
-- Aditivo e idempotente.

ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "leadMessages" BOOLEAN NOT NULL DEFAULT false;
