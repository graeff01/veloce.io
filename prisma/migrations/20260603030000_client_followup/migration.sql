-- Follow-up / próximo contato por cliente (idempotente)
DO $$ BEGIN
  ALTER TABLE "Client" ADD COLUMN "followUpAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Client" ADD COLUMN "followUpNote" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;
