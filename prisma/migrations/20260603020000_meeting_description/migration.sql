-- AlterTable (idempotente)
DO $$ BEGIN
  ALTER TABLE "Meeting" ADD COLUMN "description" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;
