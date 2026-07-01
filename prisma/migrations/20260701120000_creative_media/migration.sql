-- MetaCreative: imagem em alta + id do vídeo (idempotente)
DO $$ BEGIN
  ALTER TABLE "MetaCreative" ADD COLUMN "imageUrl" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "MetaCreative" ADD COLUMN "videoId" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;
