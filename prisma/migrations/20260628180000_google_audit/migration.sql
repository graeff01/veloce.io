-- Auditoria do Google: histórico de mudanças + diagnóstico de conta. Idempotente.

CREATE TABLE IF NOT EXISTS "GoogleChangeEvent" (
  "id"           TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "resourceName" TEXT NOT NULL,
  "changedAt"    TIMESTAMP(3) NOT NULL,
  "userEmail"    TEXT,
  "resourceType" TEXT,
  "operation"    TEXT,
  "summary"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleChangeEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleChangeEvent_connectionId_resourceName_key" ON "GoogleChangeEvent"("connectionId", "resourceName");
CREATE INDEX IF NOT EXISTS "GoogleChangeEvent_connectionId_changedAt_idx" ON "GoogleChangeEvent"("connectionId", "changedAt");

CREATE TABLE IF NOT EXISTS "GoogleDiagnostic" (
  "id"           TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "kind"         TEXT NOT NULL,
  "severity"     TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "detail"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleDiagnostic_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GoogleDiagnostic_connectionId_idx" ON "GoogleDiagnostic"("connectionId");

DO $$ BEGIN
  ALTER TABLE "GoogleChangeEvent" ADD CONSTRAINT "GoogleChangeEvent_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GoogleDiagnostic" ADD CONSTRAINT "GoogleDiagnostic_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
