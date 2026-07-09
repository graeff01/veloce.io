-- AlterTable
ALTER TABLE "AiAgentConfig" ADD COLUMN     "alwaysOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "humanize" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "intakeSpec" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "memoryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quotesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifyReplies" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visionEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeadProfile" ADD COLUMN     "data" JSONB;

-- AlterTable
ALTER TABLE "AiInteraction" ADD COLUMN     "qualityScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "AiInboundEvent" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AiInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "intake" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handoff" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "briefing" JSONB NOT NULL,
    "quoteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadMemory" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'fact',
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "embedding" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRecalledAt" TIMESTAMP(3),

    CONSTRAINT "LeadMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInboundEvent_status_createdAt_idx" ON "AiInboundEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiInboundEvent_connectionId_waMessageId_key" ON "AiInboundEvent"("connectionId", "waMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingConfig_clientId_key" ON "PricingConfig"("clientId");

-- CreateIndex
CREATE INDEX "Quote_clientId_contactId_idx" ON "Quote"("clientId", "contactId");

-- CreateIndex
CREATE INDEX "Quote_clientId_status_idx" ON "Quote"("clientId", "status");

-- CreateIndex
CREATE INDEX "Handoff_clientId_status_idx" ON "Handoff"("clientId", "status");

-- CreateIndex
CREATE INDEX "LeadMemory_clientId_contactId_idx" ON "LeadMemory"("clientId", "contactId");

-- AddForeignKey
ALTER TABLE "PricingConfig" ADD CONSTRAINT "PricingConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

