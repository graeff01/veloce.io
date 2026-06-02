-- AlterTable (idempotent)
DO $$ BEGIN
  ALTER TABLE "Client" ADD COLUMN "logoUrl" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;
