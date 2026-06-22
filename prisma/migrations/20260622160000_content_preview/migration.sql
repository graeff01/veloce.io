-- Prévia leve da arte (só para avaliação no sistema). Aditivo/idempotente.
ALTER TABLE "ContentPost" ADD COLUMN IF NOT EXISTS "previewUrl" TEXT;
