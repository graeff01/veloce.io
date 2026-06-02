-- Status por mês de lançamentos recorrentes/equipe (idempotente)
CREATE TABLE IF NOT EXISTS "FinanceStatusOverride" (
    "id"        TEXT NOT NULL,
    "refKey"    TEXT NOT NULL,
    "year"      INTEGER NOT NULL,
    "month"     INTEGER NOT NULL,
    "status"    "FinanceEntryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatusOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceStatusOverride_refKey_year_month_key"
    ON "FinanceStatusOverride" ("refKey", "year", "month");
