-- Batimento do agendador de notificações (liveness / dead-man's switch). Idempotente.

CREATE TABLE IF NOT EXISTS "SchedulerHeartbeat" (
  "name" TEXT NOT NULL,
  "at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulerHeartbeat_pkey" PRIMARY KEY ("name")
);
