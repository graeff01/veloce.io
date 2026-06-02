CREATE TABLE "WinningCampaign" (
    "id"           TEXT NOT NULL,
    "clientId"     TEXT NOT NULL,
    "month"        INTEGER NOT NULL,
    "year"         INTEGER NOT NULL,
    "name"         TEXT NOT NULL,
    "platform"     TEXT NOT NULL DEFAULT 'Meta Ads',
    "tags"         TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spend"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads"        INTEGER NOT NULL DEFAULT 0,
    "cpl"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reach"        INTEGER NOT NULL DEFAULT 0,
    "roas"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "whatWorked"   TEXT,
    "audience"     TEXT,
    "creativeUrl"  TEXT,
    "nextSteps"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinningCampaign_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WinningCampaign" ADD CONSTRAINT "WinningCampaign_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
