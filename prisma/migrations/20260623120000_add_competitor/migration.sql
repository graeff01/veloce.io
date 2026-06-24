-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pageId" TEXT,
    "region" TEXT NOT NULL DEFAULT 'BR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_clientId_idx" ON "Competitor"("clientId");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
