-- Imagem dos opcionais/acessórios (URL pública) — habilita a tool enviar_opcionais.
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "optionsImageUrl" TEXT;
