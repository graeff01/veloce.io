-- ClientBotRecipient: canal (telegram|whatsapp) + waId; chatId passa a ser opcional.
ALTER TABLE "ClientBotRecipient" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE "ClientBotRecipient" ADD COLUMN     "waId" TEXT;
ALTER TABLE "ClientBotRecipient" ALTER COLUMN "chatId" DROP NOT NULL;

-- Unicidade por canal WhatsApp (NULLs nao colidem no Postgres).
CREATE UNIQUE INDEX "ClientBotRecipient_clientId_waId_key" ON "ClientBotRecipient"("clientId", "waId");

-- HeldAlert: alertas retidos enquanto a janela de 24h do dono estava fechada.
CREATE TABLE "HeldAlert" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flushedAt" TIMESTAMP(3),

    CONSTRAINT "HeldAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HeldAlert_clientId_waId_flushedAt_idx" ON "HeldAlert"("clientId", "waId", "flushedAt");
