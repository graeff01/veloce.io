-- Suporte multimodal controlado (Fase A): transcrição de áudio + proveniência de mídia.
ALTER TABLE "AiAgentConfig" ADD COLUMN "audioTranscription" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiInteraction" ADD COLUMN "inboundMediaType" TEXT;
