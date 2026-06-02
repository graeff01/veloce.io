-- CreateTable: MetaConnection
CREATE TABLE "MetaConnection" (
    "id"           TEXT NOT NULL,
    "clientId"     TEXT NOT NULL,
    "adAccountId"  TEXT NOT NULL,
    "accessToken"  TEXT NOT NULL,
    "accountName"  TEXT,
    "currency"     TEXT,
    "lastSyncAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaConnection_clientId_key" ON "MetaConnection"("clientId");

-- CreateTable: MetaInsight
CREATE TABLE "MetaInsight" (
    "id"            TEXT NOT NULL,
    "connectionId"  TEXT NOT NULL,
    "campaignId"    TEXT NOT NULL,
    "campaignName"  TEXT NOT NULL,
    "adsetId"       TEXT,
    "adsetName"     TEXT,
    "status"        TEXT NOT NULL,
    "dateStart"     TIMESTAMP(3) NOT NULL,
    "dateStop"      TIMESTAMP(3) NOT NULL,
    "spend"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions"   INTEGER NOT NULL DEFAULT 0,
    "reach"         INTEGER NOT NULL DEFAULT 0,
    "clicks"        INTEGER NOT NULL DEFAULT 0,
    "ctr"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpm"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpc"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads"         INTEGER NOT NULL DEFAULT 0,
    "cpl"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchases"     INTEGER NOT NULL DEFAULT 0,
    "roas"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaInsight_connectionId_campaignId_dateStart_dateStop_key"
  ON "MetaInsight"("connectionId", "campaignId", "dateStart", "dateStop");

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MetaInsight" ADD CONSTRAINT "MetaInsight_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
