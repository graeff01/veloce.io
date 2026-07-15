-- Nota de voz (TTS) por cliente: liga/desliga, id da voz (ElevenLabs) e quando enviar.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "voiceReplies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "voiceId" TEXT;
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "voiceMode" TEXT NOT NULL DEFAULT 'on_audio';
