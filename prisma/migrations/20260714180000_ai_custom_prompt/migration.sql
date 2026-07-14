-- Prompt de sistema completo por cliente (substitui o prompt-base quando setado).
ALTER TABLE "AiAgentConfig" ADD COLUMN "customPrompt" TEXT;
