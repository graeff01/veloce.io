-- AlterTable
ALTER TABLE "AiAgentConfig" ADD COLUMN     "groundingEnforce" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifyReplies" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AiInteraction" ADD COLUMN     "qualityScore" DOUBLE PRECISION;

