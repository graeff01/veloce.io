-- Estado de conversa COMPARTILHADO pela equipe do cliente: leitura e arquivo.
--
-- Por que compartilhado e não por pessoa: a JR atende com três vendedoras no
-- MESMO número. Marcar como lida no aparelho de uma e continuar "não lida" para
-- as outras faz o contador perder sentido em poucos dias. Caixa de entrada
-- compartilhada se comporta como caixa compartilhada.
--
-- ADITIVA e IDEMPOTENTE: nenhuma coluna existente é alterada. Conversas antigas
-- ficam com `readAt`/`archivedAt` nulos, que é exatamente o comportamento de
-- hoje (tudo não lido, nada arquivado). O PWA ignora as colunas.
--
-- NÃO APLICADA em nenhum banco de produção por esta implementação.

ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "portalReadAt"    TIMESTAMP(3);
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "portalReadBy"    TEXT;
ALTER TABLE "WaConversation" ADD COLUMN IF NOT EXISTS "portalArchivedAt" TIMESTAMP(3);

-- A caixa de entrada filtra por "não arquivada" em toda listagem.
CREATE INDEX IF NOT EXISTS "WaConversation_connectionId_portalArchivedAt_idx"
  ON "WaConversation"("connectionId", "portalArchivedAt");
