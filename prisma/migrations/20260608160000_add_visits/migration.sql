-- CreateTable: Visit (agenda de visitas do cliente)
CREATE TABLE "Visit" (
    "id"          TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "contactId"   TEXT,
    "leadName"    TEXT NOT NULL,
    "leadPhone"   TEXT,
    "car"         TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "status"      TEXT NOT NULL DEFAULT 'agendada',
    "source"      TEXT NOT NULL DEFAULT 'manual',
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Visit_clientId_scheduledAt_idx" ON "Visit"("clientId", "scheduledAt");

ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
