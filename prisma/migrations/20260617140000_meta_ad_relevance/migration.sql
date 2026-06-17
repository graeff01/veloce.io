-- Diagnóstico de relevância da Meta por anúncio (snapshot). A própria Meta indica
-- se criativo/engajamento/conversão estão acima ou abaixo dos concorrentes.
-- Aditivo e nulo — sem risco para dados existentes.

-- AlterTable
ALTER TABLE "MetaAd" ADD COLUMN     "qualityRanking" TEXT,
ADD COLUMN     "engagementRanking" TEXT,
ADD COLUMN     "conversionRanking" TEXT;
