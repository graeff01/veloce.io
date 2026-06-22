-- Conteúdo Fase 2: recorrência (8 posts/mês) + versões da arte. Aditivo/idempotente.

ALTER TABLE "ContentPost" ADD COLUMN IF NOT EXISTS "recurrenceId" TEXT;
CREATE INDEX IF NOT EXISTS "ContentPost_recurrenceId_idx" ON "ContentPost"("recurrenceId");

CREATE TABLE IF NOT EXISTS "ContentRecurrence" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'feed',
    "weekday" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContentRecurrence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContentVersion" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "artUrl" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentVersion_postId_idx" ON "ContentVersion"("postId");

DO $$ BEGIN
  ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
