-- Camada de Inteligência (Fase 3): recomendações estruturadas com contrato de evidência.
-- Observacional — vira mudança só com aprovação humana. Dedupe por (clientId, signature).
CREATE TABLE "LearningRecommendation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetComponent" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "conversationCount" INTEGER NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedImpact" JSONB NOT NULL,
    "proposedChange" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "approvedByEmail" TEXT,
    "rejectionReason" TEXT,
    "promotedRef" TEXT,
    "measuredImpact" JSONB,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningRecommendation_clientId_signature_key" ON "LearningRecommendation"("clientId", "signature");
CREATE INDEX "LearningRecommendation_clientId_status_createdAt_idx" ON "LearningRecommendation"("clientId", "status", "createdAt");
