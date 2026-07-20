-- Cache de geocoding reverso: guarda o endereço (JSON) da coordenada.
ALTER TABLE "GeocodeCache" ADD COLUMN IF NOT EXISTS "label" TEXT;
