-- MULTI-NÚMERO por cliente.
--
-- Tira o teto de uma conexão de WhatsApp por cliente. Um cliente passa a poder
-- ter vários números — um por vendedora, cada um no celular dela, em
-- coexistência (o Meta ecoa pelo webhook o que sai do aparelho).
--
-- ADITIVA E REVERSÍVEL na prática: quem tem um número só não muda de
-- comportamento, porque continua tendo exatamente uma linha por clientId.
-- `phoneNumberId` segue ÚNICO — é a chave de roteamento do webhook, e dois
-- clientes nunca podem dividir um número.
--
-- O índice NÃO-único entra no lugar para as buscas por cliente seguirem rápidas.
DROP INDEX IF EXISTS "WaConnection_clientId_key";
CREATE INDEX IF NOT EXISTS "WaConnection_clientId_idx" ON "WaConnection"("clientId");
