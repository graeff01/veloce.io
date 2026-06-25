-- Inteligência Competitiva (interna, por cliente): players + swipe de vencedores.
-- Aditivo/idempotente.

CREATE TABLE IF NOT EXISTS "Competitor" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT,
    "adLibraryUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Competitor_clientId_idx" ON "Competitor"("clientId");

CREATE TABLE IF NOT EXISTS "WinningCreative" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "competitorId" TEXT,
    "adLibraryUrl" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "offer" TEXT,
    "note" TEXT,
    "liveSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinningCreative_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WinningCreative_clientId_idx" ON "WinningCreative"("clientId");
CREATE INDEX IF NOT EXISTS "WinningCreative_competitorId_idx" ON "WinningCreative"("competitorId");

DO $$ BEGIN
  ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "WinningCreative" ADD CONSTRAINT "WinningCreative_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "WinningCreative" ADD CONSTRAINT "WinningCreative_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
