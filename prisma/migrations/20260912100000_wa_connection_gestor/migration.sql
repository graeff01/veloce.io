-- QUEM ACOMPANHA cada número.
--
-- Duas gerentes no mesmo cliente enxergavam a operação inteira — não havia como
-- dizer "estes três números são da Michele, estes três da Vitória". Uma conta
-- para as duas, quando o trabalho de cada uma é sobre um pedaço.
--
-- O vínculo fica no NÚMERO, e não na pessoa, porque é onde a configuração já
-- mora (ao lado de quem atende e de que equipe é) e porque permite qualquer
-- divisão — inclusive uma gerente cobrindo números das duas equipes.
--
-- Aditiva e compatível: nula por padrão. Cliente sem nenhum número atribuído
-- segue como hoje, com a gestora vendo tudo.
ALTER TABLE "WaConnection" ADD COLUMN IF NOT EXISTS "gestorEmail" TEXT;

-- "Quais números são desta gerente" é a consulta que passa a rodar em toda
-- requisição do painel dela.
CREATE INDEX IF NOT EXISTS "WaConnection_clientId_gestorEmail_idx" ON "WaConnection"("clientId", "gestorEmail");
