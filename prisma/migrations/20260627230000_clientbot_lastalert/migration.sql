-- Liveness por bot de cliente (último alerta entregue). Idempotente.
ALTER TABLE "ClientBot" ADD COLUMN IF NOT EXISTS "lastAlertAt" TIMESTAMP(3);
