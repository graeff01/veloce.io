-- Modo MANUAL (PRD sob demanda): marca que o vendedor engajou a IA neste lead
-- (clicou "IA Atender"). Enquanto true, a IA completa o atendimento sozinha; um envio
-- humano (aiGenerated=false) desengaja. ADD COLUMN com default é rápido no Postgres (sem rewrite).
ALTER TABLE "WaContact" ADD COLUMN "aiEngaged" BOOLEAN NOT NULL DEFAULT false;
