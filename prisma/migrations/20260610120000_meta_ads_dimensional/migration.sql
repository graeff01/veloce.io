-- Fase 1 — Estrutura Meta dimensional por IDs oficiais (atribuição determinística).
-- Aditiva: não altera MetaInsight nem nada existente.

ALTER TABLE "MetaConnection" ADD COLUMN "lastAdSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaAdSet" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaAdSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaAd" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaAd_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaCreative" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "body" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaAdInsight" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaAdInsight_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE UNIQUE INDEX "MetaCampaign_connectionId_campaignId_key" ON "MetaCampaign"("connectionId", "campaignId");
CREATE INDEX "MetaCampaign_connectionId_idx" ON "MetaCampaign"("connectionId");

CREATE UNIQUE INDEX "MetaAdSet_connectionId_adsetId_key" ON "MetaAdSet"("connectionId", "adsetId");
CREATE INDEX "MetaAdSet_connectionId_campaignId_idx" ON "MetaAdSet"("connectionId", "campaignId");

CREATE UNIQUE INDEX "MetaAd_connectionId_adId_key" ON "MetaAd"("connectionId", "adId");
CREATE INDEX "MetaAd_connectionId_campaignId_idx" ON "MetaAd"("connectionId", "campaignId");
CREATE INDEX "MetaAd_connectionId_adsetId_idx" ON "MetaAd"("connectionId", "adsetId");
CREATE INDEX "MetaAd_connectionId_creativeId_idx" ON "MetaAd"("connectionId", "creativeId");

CREATE UNIQUE INDEX "MetaCreative_connectionId_creativeId_key" ON "MetaCreative"("connectionId", "creativeId");

CREATE UNIQUE INDEX "MetaAdInsight_connectionId_adId_date_key" ON "MetaAdInsight"("connectionId", "adId", "date");
CREATE INDEX "MetaAdInsight_connectionId_date_idx" ON "MetaAdInsight"("connectionId", "date");
CREATE INDEX "MetaAdInsight_connectionId_adId_idx" ON "MetaAdInsight"("connectionId", "adId");

-- FKs para MetaConnection (cascade)
ALTER TABLE "MetaCampaign" ADD CONSTRAINT "MetaCampaign_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdSet" ADD CONSTRAINT "MetaAdSet_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAd" ADD CONSTRAINT "MetaAd_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaCreative" ADD CONSTRAINT "MetaCreative_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdInsight" ADD CONSTRAINT "MetaAdInsight_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
