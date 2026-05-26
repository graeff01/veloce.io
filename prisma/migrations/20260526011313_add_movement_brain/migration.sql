-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'REVIEW', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('OBSERVATION', 'PATTERN', 'WARNING', 'WINNING_STRATEGY', 'HYPOTHESIS');

-- AlterTable
ALTER TABLE "ClientPlan" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "renewDay" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PlanItem" ADD COLUMN     "checklistItems" TEXT[],
ADD COLUMN     "deadlineDayOfMonth" INTEGER,
ADD COLUMN     "defaultPriority" TEXT NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "MovementStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "assignedTo" TEXT,
    "description" TEXT,
    "links" TEXT[],
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brain" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Insight',
    "links" TEXT[],
    "tags" TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "vehicle" TEXT,
    "budget" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "winner" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMetric" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "cpl" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION,
    "cpm" DOUBLE PRECISION,
    "leads" INTEGER,
    "retention" DOUBLE PRECISION,
    "period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "angle" TEXT,
    "style" TEXT,
    "niche" TEXT,
    "vehicleType" TEXT,
    "platform" TEXT,
    "retention" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION,
    "cpl" DOUBLE PRECISION,
    "winner" BOOLEAN NOT NULL DEFAULT false,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "mediaUrl" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInsight" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "content" TEXT NOT NULL,
    "type" "InsightType" NOT NULL DEFAULT 'OBSERVATION',
    "niche" TEXT,
    "vehicleType" TEXT,
    "platform" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "niche" TEXT,
    "vehicleType" TEXT,
    "objective" TEXT,
    "platform" TEXT,
    "summary" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookStep" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalInsight" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "InsightType" NOT NULL DEFAULT 'OBSERVATION',
    "niche" TEXT,
    "vehicleType" TEXT,
    "platform" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalInsight_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brain" ADD CONSTRAINT "Brain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetric" ADD CONSTRAINT "CampaignMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInsight" ADD CONSTRAINT "CampaignInsight_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookStep" ADD CONSTRAINT "PlaybookStep_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
