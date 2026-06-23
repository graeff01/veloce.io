-- Painel do cliente (capability URL + tema por cliente). Idempotente.

CREATE TABLE IF NOT EXISTS "ClientPortal" (
  "clientId"    TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "accentColor" TEXT,
  "mode"        TEXT NOT NULL DEFAULT 'light',
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPortal_pkey" PRIMARY KEY ("clientId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientPortal_token_key" ON "ClientPortal"("token");
