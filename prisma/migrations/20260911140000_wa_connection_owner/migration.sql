-- IDENTIDADE DO NÚMERO: quem atende e de que time.
--
-- Com um número por pessoa, o dono da conversa deixa de ser quem a atribuiu na
-- mão e passa a ser quem atende NAQUELE número. É o que faz a métrica individual
-- existir sem trabalho manual.
--
-- Aditiva: ambas nulas por padrão, e quem tem um número só segue sem dona —
-- exatamente como hoje.
ALTER TABLE "WaConnection" ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT;
ALTER TABLE "WaConnection" ADD COLUMN IF NOT EXISTS "equipe"     TEXT;

-- Agrupar por dona e por time é a consulta central do painel das gerentes.
CREATE INDEX IF NOT EXISTS "WaConnection_clientId_ownerEmail_idx" ON "WaConnection"("clientId", "ownerEmail");
