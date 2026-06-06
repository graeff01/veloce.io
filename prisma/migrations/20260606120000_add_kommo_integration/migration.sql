-- CreateTable: KommoConnection
CREATE TABLE "KommoConnection" (
    "id"            TEXT NOT NULL,
    "clientId"      TEXT NOT NULL,
    "subdomain"     TEXT NOT NULL,
    "accessToken"   TEXT NOT NULL,
    "refreshToken"  TEXT,
    "expiresAt"     TIMESTAMP(3),
    "oauthClientId" TEXT,
    "oauthSecret"   TEXT,
    "accountName"   TEXT,
    "adTags"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lastSyncAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KommoConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KommoConnection_clientId_key" ON "KommoConnection"("clientId");

-- CreateTable: KommoLead
CREATE TABLE "KommoLead" (
    "id"             TEXT NOT NULL,
    "connectionId"   TEXT NOT NULL,
    "kommoId"        INTEGER NOT NULL,
    "name"           TEXT,
    "contactName"    TEXT,
    "phone"          TEXT,
    "adTag"          TEXT,
    "tags"           JSONB,
    "statusId"       INTEGER,
    "statusName"     TEXT,
    "pipelineId"     INTEGER,
    "pipelineName"   TEXT,
    "price"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAtKommo" TIMESTAMP(3) NOT NULL,
    "updatedAtKommo" TIMESTAMP(3),
    "timeline"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KommoLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KommoLead_connectionId_kommoId_key" ON "KommoLead"("connectionId", "kommoId");
CREATE INDEX "KommoLead_connectionId_createdAtKommo_idx" ON "KommoLead"("connectionId", "createdAtKommo");
CREATE INDEX "KommoLead_connectionId_adTag_idx" ON "KommoLead"("connectionId", "adTag");

-- AddForeignKey
ALTER TABLE "KommoConnection" ADD CONSTRAINT "KommoConnection_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KommoLead" ADD CONSTRAINT "KommoLead_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "KommoConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
