-- Prompt caching: mede os tokens de entrada servidos pelo cache da OpenAI (subconjunto de tokensIn).
-- Aditivo e retrocompatível (default 0 nas linhas existentes).
ALTER TABLE "AiUsage" ADD COLUMN IF NOT EXISTS "cachedTokens" INTEGER NOT NULL DEFAULT 0;
