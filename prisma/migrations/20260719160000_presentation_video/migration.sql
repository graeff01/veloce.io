-- Vídeo de apresentação por cliente (URL pública) — expõe a tool enviar_video.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "presentationVideoUrl" TEXT;
