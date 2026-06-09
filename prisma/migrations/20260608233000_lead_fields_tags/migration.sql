-- Fase 1: ficha de lead auditável. Tudo aditivo (defaults), não muda contagens.

-- Campos do contato (nome interno, notas, validade p/ relatório).
ALTER TABLE "WaContact" ADD COLUMN "displayName" TEXT;
ALTER TABLE "WaContact" ADD COLUMN "notes" TEXT;
ALTER TABLE "WaContact" ADD COLUMN "reportValid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WaContact" ADD COLUMN "reportInvalidReason" TEXT;

-- Tags planas por conexão.
CREATE TABLE "WaTag" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#64748B',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaTag_connectionId_name_key" ON "WaTag"("connectionId", "name");
CREATE INDEX "WaTag_connectionId_idx" ON "WaTag"("connectionId");
ALTER TABLE "WaTag" ADD CONSTRAINT "WaTag_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "WaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WaContactTag" (
  "contactId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  CONSTRAINT "WaContactTag_pkey" PRIMARY KEY ("contactId", "tagId")
);
CREATE INDEX "WaContactTag_tagId_idx" ON "WaContactTag"("tagId");
ALTER TABLE "WaContactTag" ADD CONSTRAINT "WaContactTag_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaContactTag" ADD CONSTRAINT "WaContactTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "WaTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
