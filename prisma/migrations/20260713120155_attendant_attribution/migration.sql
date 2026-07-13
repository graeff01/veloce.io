-- AlterTable
ALTER TABLE "WaMessage" ADD COLUMN     "sentByEmail" TEXT;

-- AlterTable
ALTER TABLE "WaConversation" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedEmail" TEXT;

-- CreateIndex
CREATE INDEX "WaConversation_connectionId_assignedEmail_idx" ON "WaConversation"("connectionId", "assignedEmail");
