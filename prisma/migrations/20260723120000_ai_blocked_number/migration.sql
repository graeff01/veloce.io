-- Lista GLOBAL de números que a IA nunca responde (donos, colaboradores...).
CREATE TABLE IF NOT EXISTS "AiBlockedNumber" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiBlockedNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiBlockedNumber_phone_key" ON "AiBlockedNumber"("phone");
