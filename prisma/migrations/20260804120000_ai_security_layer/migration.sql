-- Camada de segurança da IA (docs/rfc-camada-seguranca-ia.md)
-- Migração ADITIVA: nenhuma coluna/tabela existente é alterada ou removida.
-- O código funciona (degradado) mesmo antes desta migração ser aplicada:
-- emitSecurityEvent cai em log e o rate limit cai no contador em memória.

-- Correlação forense de um turno completo do agente.
ALTER TABLE "AiInteraction" ADD COLUMN IF NOT EXISTS "turnId" TEXT;

-- Trilha dos controles de segurança.
CREATE TABLE IF NOT EXISTS "AiSecurityEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "turnId" TEXT,
    "ring" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "labels" JSONB,
    "action" TEXT NOT NULL,
    "evidence" TEXT,
    "shadow" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiSecurityEvent_clientId_createdAt_idx" ON "AiSecurityEvent"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiSecurityEvent_contactId_createdAt_idx" ON "AiSecurityEvent"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiSecurityEvent_control_severity_createdAt_idx" ON "AiSecurityEvent"("control", "severity", "createdAt");

-- Contador de janela fixa para rate limiting/quotas (distribuído por construção).
CREATE TABLE IF NOT EXISTS "RateBucket" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateBucket_expiresAt_idx" ON "RateBucket"("expiresAt");
