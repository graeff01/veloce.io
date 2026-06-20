-- Selo de confiança na abertura + galeria de fotos por veículo. Idempotente.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "trustHighlights" TEXT;
ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
