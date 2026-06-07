-- Resumo e sugestão de etapa por IA na conversa.
ALTER TABLE "WaConversation" ADD COLUMN "aiSummary" TEXT;
ALTER TABLE "WaConversation" ADD COLUMN "aiSuggestedStage" TEXT;
ALTER TABLE "WaConversation" ADD COLUMN "aiUpdatedAt" TIMESTAMP(3);
