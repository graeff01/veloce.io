-- Frente 2: pergunta "fechou?" ao gestor + valor da venda. Idempotente.
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "saleValue" DOUBLE PRECISION;
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "saleConfirmedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "FunnelCheck" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "recipientWaId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "response" TEXT,
  "awaitingValue" BOOLEAN NOT NULL DEFAULT false,
  "reaskCount" INTEGER NOT NULL DEFAULT 0,
  "askedAt" TIMESTAMP(3),
  "reaskAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FunnelCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FunnelCheck_contactId_key" ON "FunnelCheck"("contactId");
CREATE INDEX IF NOT EXISTS "FunnelCheck_connectionId_status_idx" ON "FunnelCheck"("connectionId", "status");
CREATE INDEX IF NOT EXISTS "FunnelCheck_recipientWaId_awaitingValue_idx" ON "FunnelCheck"("recipientWaId", "awaitingValue");
