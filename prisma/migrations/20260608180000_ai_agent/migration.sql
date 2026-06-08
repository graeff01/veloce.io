-- AiAgentConfig
CREATE TABLE "AiAgentConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "persona" TEXT,
    "goals" TEXT,
    "rules" TEXT,
    "businessHours" JSONB NOT NULL DEFAULT '[]',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "fallbackMessage" TEXT,
    "handoffAfter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiAgentConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiAgentConfig_clientId_key" ON "AiAgentConfig"("clientId");

-- CatalogItem
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "attributes" JSONB,
    "url" TEXT,
    "imageUrl" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CatalogItem_clientId_available_idx" ON "CatalogItem"("clientId", "available");
CREATE INDEX "CatalogItem_clientId_externalId_idx" ON "CatalogItem"("clientId", "externalId");

-- KnowledgeChunk
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeChunk_clientId_idx" ON "KnowledgeChunk"("clientId");

-- LeadProfile
CREATE TABLE "LeadProfile" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "productInterest" TEXT,
    "budget" TEXT,
    "hasTradeIn" BOOLEAN,
    "wantsFinancing" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeadProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeadProfile_contactId_key" ON "LeadProfile"("contactId");
CREATE INDEX "LeadProfile_connectionId_idx" ON "LeadProfile"("connectionId");

-- AiInteraction
CREATE TABLE "AiInteraction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "inbound" TEXT,
    "outbound" TEXT,
    "toolCalls" JSONB,
    "decision" TEXT,
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiInteraction_clientId_createdAt_idx" ON "AiInteraction"("clientId", "createdAt");
CREATE INDEX "AiInteraction_contactId_createdAt_idx" ON "AiInteraction"("contactId", "createdAt");

-- VisitConfig
CREATE TABLE "VisitConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "capacityPerSlot" INTEGER NOT NULL DEFAULT 1,
    "windows" JSONB NOT NULL DEFAULT '[]',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VisitConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VisitConfig_clientId_key" ON "VisitConfig"("clientId");

-- Foreign keys
ALTER TABLE "AiAgentConfig" ADD CONSTRAINT "AiAgentConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitConfig" ADD CONSTRAINT "VisitConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
