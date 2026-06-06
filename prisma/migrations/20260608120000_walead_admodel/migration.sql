-- Modelo/anúncio detectado na mensagem de abertura ("anúncio do {modelo}").
ALTER TABLE "WaLead" ADD COLUMN "adModel" TEXT;
CREATE INDEX "WaLead_connectionId_adModel_idx" ON "WaLead"("connectionId", "adModel");
