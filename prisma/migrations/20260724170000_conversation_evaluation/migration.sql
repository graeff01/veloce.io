-- Camada de Inteligência (Fase 1): avaliação técnica determinística por CONVERSA.
-- Observacional — não altera comportamento da IA. Idempotente por (contactId, closureAt).
CREATE TABLE "ConversationEvaluation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "closureAt" TIMESTAMP(3) NOT NULL,
    "windowStart" TIMESTAMP(3),
    "overall" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'deterministic',
    "rubricVersion" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationEvaluation_contactId_closureAt_key" ON "ConversationEvaluation"("contactId", "closureAt");
CREATE INDEX "ConversationEvaluation_clientId_createdAt_idx" ON "ConversationEvaluation"("clientId", "createdAt");
CREATE INDEX "ConversationEvaluation_clientId_overall_idx" ON "ConversationEvaluation"("clientId", "overall");
