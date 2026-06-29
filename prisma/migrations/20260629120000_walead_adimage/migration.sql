-- Imagem do criativo vinda no referral CTWA (card do anúncio na conversa). Idempotente.
ALTER TABLE "WaLead" ADD COLUMN IF NOT EXISTS "adImageUrl" TEXT;
