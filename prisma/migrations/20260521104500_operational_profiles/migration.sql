-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "operationalRole" TEXT;

-- AlterTable
ALTER TABLE "Client"
ADD COLUMN "brand" TEXT,
ADD COLUMN "primaryContact" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "instagram" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "operationType" TEXT,
ADD COLUMN "niche" TEXT,
ADD COLUMN "mainGoal" TEXT,
ADD COLUMN "contractStart" TIMESTAMP(3),
ADD COLUMN "operationalFrequency" TEXT,
ADD COLUMN "strategicNotes" TEXT,
ADD COLUMN "communicationTone" TEXT,
ADD COLUMN "restrictions" TEXT,
ADD COLUMN "preferences" TEXT,
ADD COLUMN "clientBehavior" TEXT;

-- AlterTable
ALTER TABLE "Plan"
ADD COLUMN "category" TEXT,
ADD COLUMN "frequency" TEXT,
ADD COLUMN "intensity" TEXT,
ADD COLUMN "averageDeadlineDays" INTEGER,
ADD COLUMN "reviewDays" INTEGER,
ADD COLUMN "demandLimit" INTEGER;

-- AlterTable
ALTER TABLE "Task"
ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "blocker" TEXT;
