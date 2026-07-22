-- Texto de anúncio do vídeo de apresentação (enviado ANTES do vídeo, por cliente).
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "presentationVideoIntro" TEXT;
