-- Superpoderes do Google: parcela de impressões, termos de busca, palavras-chave. Idempotente.

-- Impression share por campanha (frações 0–1)
ALTER TABLE "GoogleCampaign" ADD COLUMN IF NOT EXISTS "impressionShare" DOUBLE PRECISION;
ALTER TABLE "GoogleCampaign" ADD COLUMN IF NOT EXISTS "lostBudget" DOUBLE PRECISION;
ALTER TABLE "GoogleCampaign" ADD COLUMN IF NOT EXISTS "lostRank" DOUBLE PRECISION;

-- Termos de busca reais
CREATE TABLE IF NOT EXISTS "GoogleSearchTerm" (
  "id"           TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "term"         TEXT NOT NULL,
  "spend"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressions"  INTEGER NOT NULL DEFAULT 0,
  "clicks"       INTEGER NOT NULL DEFAULT 0,
  "conversions"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleSearchTerm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleSearchTerm_connectionId_term_key" ON "GoogleSearchTerm"("connectionId", "term");
CREATE INDEX IF NOT EXISTS "GoogleSearchTerm_connectionId_idx" ON "GoogleSearchTerm"("connectionId");

-- Palavras-chave
CREATE TABLE IF NOT EXISTS "GoogleKeyword" (
  "id"           TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "keyword"      TEXT NOT NULL,
  "matchType"    TEXT NOT NULL DEFAULT '',
  "qualityScore" INTEGER,
  "spend"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressions"  INTEGER NOT NULL DEFAULT 0,
  "clicks"       INTEGER NOT NULL DEFAULT 0,
  "conversions"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleKeyword_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleKeyword_connectionId_keyword_matchType_key" ON "GoogleKeyword"("connectionId", "keyword", "matchType");
CREATE INDEX IF NOT EXISTS "GoogleKeyword_connectionId_idx" ON "GoogleKeyword"("connectionId");

DO $$ BEGIN
  ALTER TABLE "GoogleSearchTerm" ADD CONSTRAINT "GoogleSearchTerm_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GoogleKeyword" ADD CONSTRAINT "GoogleKeyword_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
