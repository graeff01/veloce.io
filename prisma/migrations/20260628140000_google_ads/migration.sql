-- Motor do Google Ads (espelho do padrão Meta). Idempotente.

CREATE TABLE IF NOT EXISTS "GoogleConnection" (
  "id"              TEXT NOT NULL,
  "clientId"        TEXT NOT NULL,
  "customerId"      TEXT NOT NULL,
  "loginCustomerId" TEXT,
  "refreshToken"    TEXT,
  "accountName"     TEXT,
  "currency"        TEXT,
  "lastSyncAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleConnection_clientId_key" ON "GoogleConnection"("clientId");

CREATE TABLE IF NOT EXISTS "GoogleCampaign" (
  "id"           TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "campaignId"   TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "status"       TEXT NOT NULL,
  "spend"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressions"  INTEGER NOT NULL DEFAULT 0,
  "clicks"       INTEGER NOT NULL DEFAULT 0,
  "conversions"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleCampaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleCampaign_connectionId_campaignId_key" ON "GoogleCampaign"("connectionId", "campaignId");
CREATE INDEX IF NOT EXISTS "GoogleCampaign_connectionId_idx" ON "GoogleCampaign"("connectionId");

CREATE TABLE IF NOT EXISTS "GoogleInsight" (
  "id"           TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "spend"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressions"  INTEGER NOT NULL DEFAULT 0,
  "clicks"       INTEGER NOT NULL DEFAULT 0,
  "conversions"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleInsight_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleInsight_connectionId_date_key" ON "GoogleInsight"("connectionId", "date");
CREATE INDEX IF NOT EXISTS "GoogleInsight_connectionId_idx" ON "GoogleInsight"("connectionId");

DO $$ BEGIN
  ALTER TABLE "GoogleCampaign" ADD CONSTRAINT "GoogleCampaign_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GoogleInsight" ADD CONSTRAINT "GoogleInsight_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
