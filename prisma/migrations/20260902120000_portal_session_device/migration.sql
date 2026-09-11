-- Sessão de aparelho para o app iOS do Portal do Cliente.
-- ADITIVA e IDEMPOTENTE: nenhuma coluna existente é alterada ou removida; sessões de
-- navegador já existentes ficam com deviceId = NULL e comportamento inalterado.
-- NÃO APLICADA em nenhum banco por esta implementação.

ALTER TABLE "PortalSession" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "PortalSession" ADD COLUMN IF NOT EXISTS "deviceName" TEXT;
ALTER TABLE "PortalSession" ADD COLUMN IF NOT EXISTS "devicePlatform" TEXT;

-- Revogação de um aparelho específico (clientId + email + deviceId).
CREATE INDEX IF NOT EXISTS "PortalSession_clientId_email_deviceId_idx"
  ON "PortalSession"("clientId", "email", "deviceId");
