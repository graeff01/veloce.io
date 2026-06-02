-- Inclui adsetId na chave única do MetaInsight para não colapsar adsets
-- diferentes da mesma campanha. Idempotente.
DO $$ BEGIN
  ALTER TABLE "MetaInsight" DROP CONSTRAINT "MetaInsight_connectionId_campaignId_dateStart_dateStop_key";
EXCEPTION WHEN undefined_object THEN null; END $$;

DROP INDEX IF EXISTS "MetaInsight_connectionId_campaignId_dateStart_dateStop_key";

CREATE UNIQUE INDEX IF NOT EXISTS "MetaInsight_row_key"
    ON "MetaInsight" ("connectionId", "campaignId", "adsetId", "dateStart", "dateStop");
