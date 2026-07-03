-- Auto-resposta de lead sem atendimento (marca a tentativa p/ não repetir). Idempotente.
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "autoRepliedAt" TIMESTAMP(3);
