-- Mídia persistida das WaMessage (imagem/áudio/vídeo/doc). Evita a "expiração na Meta":
-- baixamos os bytes uma vez e servimos daqui. Áudio guarda também a transcrição.
CREATE TABLE "WaMedia" (
    "messageId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "transcription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMedia_pkey" PRIMARY KEY ("messageId")
);

ALTER TABLE "WaMedia" ADD CONSTRAINT "WaMedia_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
