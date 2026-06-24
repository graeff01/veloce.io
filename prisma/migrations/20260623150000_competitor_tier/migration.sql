-- AlterTable: classificação do player (serio | medio | amador) — só se modela dos sérios.
ALTER TABLE "Competitor" ADD COLUMN "tier" TEXT;
