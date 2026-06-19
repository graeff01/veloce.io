-- Busca de catálogo tolerante a erro de digitação (similaridade de trigramas).
-- Usada pelo fallback fuzzy de buscar_estoque (word_similarity). Idempotente.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
