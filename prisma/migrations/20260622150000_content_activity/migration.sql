-- Feed de atividade da pauta (comentários + eventos). Aditivo/idempotente.
CREATE TABLE IF NOT EXISTS "ContentActivity" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentActivity_postId_idx" ON "ContentActivity"("postId");

DO $$ BEGIN
  ALTER TABLE "ContentActivity" ADD CONSTRAINT "ContentActivity_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
