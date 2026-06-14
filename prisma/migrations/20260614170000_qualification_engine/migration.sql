-- Sprint 2 (Qualification Engine): slots de urgência/visita/intenção de compra e
-- cache da temperatura (COLD/WARM/HOT) do score v2. Idempotente.

ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "urgency"     TEXT;
ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "visitIntent" BOOLEAN;
ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "readyToBuy"  BOOLEAN;
ALTER TABLE "LeadProfile" ADD COLUMN IF NOT EXISTS "temperature" TEXT;
