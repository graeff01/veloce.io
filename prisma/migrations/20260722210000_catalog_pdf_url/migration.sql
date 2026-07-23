-- PDF do catálogo completo por cliente (expõe a tool enviar_catalogo).
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "catalogPdfUrl" TEXT;
