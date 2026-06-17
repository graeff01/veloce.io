-- Camada de inteligência de anúncios: idade real, orçamento, fase de aprendizado,
-- frequência e número de WhatsApp de destino. Todas as colunas são aditivas e
-- nulas (frequency tem default 0) — sem risco para dados existentes.

-- AlterTable
ALTER TABLE "MetaCampaign" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "dailyBudget" DOUBLE PRECISION,
ADD COLUMN     "lifetimeBudget" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MetaAdSet" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "dailyBudget" DOUBLE PRECISION,
ADD COLUMN     "lifetimeBudget" DOUBLE PRECISION,
ADD COLUMN     "learningStage" TEXT,
ADD COLUMN     "destinationType" TEXT;

-- AlterTable
ALTER TABLE "MetaAd" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "whatsappNumber" TEXT;

-- AlterTable
ALTER TABLE "MetaAdInsight" ADD COLUMN     "frequency" DOUBLE PRECISION NOT NULL DEFAULT 0;
