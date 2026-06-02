-- CreateEnum
CREATE TYPE "FinanceEntryType" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "FinanceEntryMode" AS ENUM ('RECORRENTE', 'AVULSO');

-- CreateEnum
CREATE TYPE "FinanceEntryStatus" AS ENUM ('PAGO', 'PENDENTE', 'VENCIDO');

-- CreateEnum
CREATE TYPE "TeamMemberType" AS ENUM ('FUNCIONARIO', 'PRESTADOR');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id"          TEXT NOT NULL,
    "type"        "FinanceEntryType" NOT NULL,
    "mode"        "FinanceEntryMode" NOT NULL DEFAULT 'AVULSO',
    "description" TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "value"       DOUBLE PRECISION NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL,
    "status"      "FinanceEntryStatus" NOT NULL DEFAULT 'PENDENTE',
    "clientId"    TEXT,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "deletedAt"   TIMESTAMP(3),

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id"         TEXT NOT NULL,
    "type"       "TeamMemberType" NOT NULL,
    "name"       TEXT NOT NULL,
    "role"       TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "email"      TEXT NOT NULL DEFAULT '',
    "phone"      TEXT NOT NULL DEFAULT '',
    "salary"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitValue"  DOUBLE PRECISION,
    "unit"       TEXT,
    "status"     "TeamMemberStatus" NOT NULL DEFAULT 'ATIVO',
    "startDate"  TIMESTAMP(3),
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    "deletedAt"  TIMESTAMP(3),

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
