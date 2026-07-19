-- Cache de geocode de bairros (frete por zona).
CREATE TABLE IF NOT EXISTS "GeocodeCache" (
    "key" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("key")
);
