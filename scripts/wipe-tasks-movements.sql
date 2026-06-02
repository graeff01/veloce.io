-- Zera o sistema: remove TODAS as tarefas e movimentações (Kanban + Calendário).
-- Usa soft-delete (deletedAt), igual ao app — some da interface, sem quebrar
-- referências (checklists, logs de execução etc).
--
-- Como rodar no Railway:
--   1. Abra o serviço do banco Postgres no projeto.
--   2. Vá em "Data" / "Query" (ou conecte via psql usando a connection string).
--   3. Cole e execute os comandos abaixo.

UPDATE "Task"     SET "deletedAt" = NOW() WHERE "deletedAt" IS NULL;
UPDATE "Movement" SET "deletedAt" = NOW() WHERE "deletedAt" IS NULL;

-- Conferência (opcional): ambos devem retornar 0
-- SELECT count(*) FROM "Task"     WHERE "deletedAt" IS NULL;
-- SELECT count(*) FROM "Movement" WHERE "deletedAt" IS NULL;
