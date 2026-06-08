-- Marca leads de anúncio que vieram de importação (ex: CSV do Kommo).
-- Não têm mensagens próprias no WhatsApp; servem para o relatório histórico.
ALTER TABLE "WaLead" ADD COLUMN "imported" BOOLEAN NOT NULL DEFAULT false;
