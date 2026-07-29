-- Reação (emoji) que o lead deu a uma mensagem. Aplicada na própria WaMessage alvo
-- (o evento "reaction" do webhook não vira mensagem visível).
ALTER TABLE "WaMessage" ADD COLUMN "reaction" TEXT;
