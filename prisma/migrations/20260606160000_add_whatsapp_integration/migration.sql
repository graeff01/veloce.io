-- CreateTable: WaConnection
CREATE TABLE "WaConnection" (
    "id"            TEXT NOT NULL,
    "clientId"      TEXT NOT NULL,
    "wabaId"        TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhone"  TEXT,
    "accessToken"   TEXT NOT NULL,
    "appSecret"     TEXT,
    "name"          TEXT,
    "lastEventAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaConnection_clientId_key" ON "WaConnection"("clientId");
CREATE UNIQUE INDEX "WaConnection_phoneNumberId_key" ON "WaConnection"("phoneNumberId");

-- CreateTable: WaContact
CREATE TABLE "WaContact" (
    "id"            TEXT NOT NULL,
    "connectionId"  TEXT NOT NULL,
    "waId"          TEXT NOT NULL,
    "name"          TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaContact_connectionId_waId_key" ON "WaContact"("connectionId", "waId");
CREATE INDEX "WaContact_connectionId_lastMessageAt_idx" ON "WaContact"("connectionId", "lastMessageAt");

-- CreateTable: WaMessage
CREATE TABLE "WaMessage" (
    "id"            TEXT NOT NULL,
    "connectionId"  TEXT NOT NULL,
    "contactId"     TEXT NOT NULL,
    "waMessageId"   TEXT NOT NULL,
    "direction"     TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "text"          TEXT,
    "timestamp"     TIMESTAMP(3) NOT NULL,
    "raw"           JSONB,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaMessage_connectionId_waMessageId_key" ON "WaMessage"("connectionId", "waMessageId");
CREATE INDEX "WaMessage_connectionId_timestamp_idx" ON "WaMessage"("connectionId", "timestamp");
CREATE INDEX "WaMessage_contactId_timestamp_idx" ON "WaMessage"("contactId", "timestamp");

-- CreateTable: WaLead
CREATE TABLE "WaLead" (
    "id"            TEXT NOT NULL,
    "connectionId"  TEXT NOT NULL,
    "contactId"     TEXT NOT NULL,
    "waId"          TEXT NOT NULL,
    "name"          TEXT,
    "adId"          TEXT,
    "adTitle"       TEXT,
    "adBody"        TEXT,
    "sourceType"    TEXT,
    "sourceUrl"     TEXT,
    "ctwaClid"      TEXT,
    "enteredAt"     TIMESTAMP(3) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaLead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaLead_contactId_key" ON "WaLead"("contactId");
CREATE INDEX "WaLead_connectionId_enteredAt_idx" ON "WaLead"("connectionId", "enteredAt");
CREATE INDEX "WaLead_connectionId_adId_idx" ON "WaLead"("connectionId", "adId");

-- Foreign keys
ALTER TABLE "WaConnection" ADD CONSTRAINT "WaConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaLead" ADD CONSTRAINT "WaLead_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
