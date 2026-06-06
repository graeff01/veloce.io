-- WaMessage: status de entrega/leitura
ALTER TABLE "WaMessage" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "WaMessage" ADD COLUMN "readAt" TIMESTAMP(3);

-- CreateTable: WaConversation
CREATE TABLE "WaConversation" (
    "id"               TEXT NOT NULL,
    "connectionId"     TEXT NOT NULL,
    "contactId"        TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'open',
    "funnelStage"      TEXT,
    "firstInboundAt"   TIMESTAMP(3),
    "firstResponseAt"  TIMESTAMP(3),
    "firstResponseSec" INTEGER,
    "lastInboundAt"    TIMESTAMP(3),
    "lastOutboundAt"   TIMESTAMP(3),
    "lastMessageAt"    TIMESTAMP(3),
    "inboundCount"     INTEGER NOT NULL DEFAULT 0,
    "outboundCount"    INTEGER NOT NULL DEFAULT 0,
    "openedAt"         TIMESTAMP(3),
    "closedAt"         TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaConversation_contactId_key" ON "WaConversation"("contactId");
CREATE INDEX "WaConversation_connectionId_status_idx" ON "WaConversation"("connectionId", "status");
CREATE INDEX "WaConversation_connectionId_funnelStage_idx" ON "WaConversation"("connectionId", "funnelStage");
CREATE INDEX "WaConversation_connectionId_lastMessageAt_idx" ON "WaConversation"("connectionId", "lastMessageAt");
CREATE INDEX "WaConversation_connectionId_firstInboundAt_idx" ON "WaConversation"("connectionId", "firstInboundAt");

-- CreateTable: WaEvent
CREATE TABLE "WaEvent" (
    "id"           TEXT NOT NULL,
    "connectionId" TEXT,
    "type"         TEXT NOT NULL,
    "refId"        TEXT,
    "data"         JSONB,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WaEvent_connectionId_type_createdAt_idx" ON "WaEvent"("connectionId", "type", "createdAt");
CREATE INDEX "WaEvent_type_createdAt_idx" ON "WaEvent"("type", "createdAt");

-- Foreign keys
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaEvent" ADD CONSTRAINT "WaEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
