-- TOKEN RECUSADO: tornar visível uma falha que era silenciosa.
--
-- Quando o token de um número expira ou é revogado, as mensagens CONTINUAM
-- chegando — o webhook não usa o nosso token. Então `lastEventAt` segue
-- atualizando e o alerta de "número mudo" diz que está tudo bem, enquanto a
-- mídia para de carregar e a IA para de responder.
--
-- O número parece vivo e está quebrado. Com os funcionários respondendo pelo
-- próprio celular (coexistência), ninguém percebe até alguém reclamar que a
-- foto não abre.
--
-- Aditiva: ambas nulas. Cliente nenhum muda de comportamento pelo deploy.
ALTER TABLE "WaConnection" ADD COLUMN IF NOT EXISTS "tokenFalhouEm" TIMESTAMP(3);
ALTER TABLE "WaConnection" ADD COLUMN IF NOT EXISTS "tokenErro"     TEXT;
