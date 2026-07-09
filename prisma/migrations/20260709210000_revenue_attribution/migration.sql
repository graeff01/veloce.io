-- Revenue attribution (Semana 1). ADITIVA: só adiciona colunas/índices, nada destrutivo.

-- Item 2 — re-pergunta do valor da venda (venda confirmada sem valor informado).
ALTER TABLE "FunnelCheck" ADD COLUMN     "valueReaskCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FunnelCheck" ADD COLUMN     "valueReaskAt" TIMESTAMP(3);
ALTER TABLE "FunnelCheck" ADD COLUMN     "saleValueGaveUp" BOOLEAN NOT NULL DEFAULT false;

-- Item 1 — atribuição de receita por período: consulta WaConversation por
-- (connectionId, saleConfirmedAt). Índice para evitar full scan no painel.
CREATE INDEX "WaConversation_connectionId_saleConfirmedAt_idx" ON "WaConversation"("connectionId", "saleConfirmedAt");
