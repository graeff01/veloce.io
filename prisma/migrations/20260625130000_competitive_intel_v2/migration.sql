-- Inteligência Competitiva v2: logo do player + escolher anúncio próprio. Aditivo.
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "pageId" TEXT;

ALTER TABLE "WinningCreative" ADD COLUMN IF NOT EXISTS "adId" TEXT;
ALTER TABLE "WinningCreative" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;
ALTER TABLE "WinningCreative" ADD COLUMN IF NOT EXISTS "adName" TEXT;
ALTER TABLE "WinningCreative" ALTER COLUMN "adLibraryUrl" DROP NOT NULL;
