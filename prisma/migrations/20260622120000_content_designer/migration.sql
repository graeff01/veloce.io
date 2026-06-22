-- Conteúdo interno da Veloce + papel DESIGNER. Aditivo e idempotente.

-- Novo papel (re-rodável).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DESIGNER';

-- Posts de conteúdo da Veloce (não é por cliente).
CREATE TABLE IF NOT EXISTS "ContentPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'feed',
    "copy" TEXT,
    "references" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pauta',
    "publishDate" TIMESTAMP(3),
    "artUrl" TEXT,
    "feedback" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentPost_status_idx" ON "ContentPost"("status");
