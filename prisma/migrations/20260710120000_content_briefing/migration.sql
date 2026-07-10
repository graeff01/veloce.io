-- Briefing estruturado da pauta (ContentPost). Aditivo e idempotente.
-- Campos de texto opcionais + duas listas (mustHaves/avoid) como TEXT[] com default vazio,
-- pra a UI renderizar checklist sem precisar tratar null.

DO $$ BEGIN
  ALTER TABLE "ContentPost" ADD COLUMN "objetivo" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPost" ADD COLUMN "publicoAlvo" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPost" ADD COLUMN "formato" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPost" ADD COLUMN "cta" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPost" ADD COLUMN "tom" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPost" ADD COLUMN "mustHaves" TEXT[] NOT NULL DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentPost" ADD COLUMN "avoid" TEXT[] NOT NULL DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN null;
END $$;
