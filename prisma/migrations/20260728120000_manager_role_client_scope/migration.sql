-- Papel MANAGER (gestor com carteira escopada) + vínculo N–N User↔Client.
-- Aditivo e idempotente (re-rodável).

-- Novo papel.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';

-- Join table implícita da relação "ManagedClients" (Client=A, User=B).
CREATE TABLE IF NOT EXISTS "_ManagedClients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "_ManagedClients_AB_unique" ON "_ManagedClients"("A", "B");
CREATE INDEX IF NOT EXISTS "_ManagedClients_B_index" ON "_ManagedClients"("B");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = '_ManagedClients_A_fkey'
    ) THEN
        ALTER TABLE "_ManagedClients"
            ADD CONSTRAINT "_ManagedClients_A_fkey" FOREIGN KEY ("A")
            REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = '_ManagedClients_B_fkey'
    ) THEN
        ALTER TABLE "_ManagedClients"
            ADD CONSTRAINT "_ManagedClients_B_fkey" FOREIGN KEY ("B")
            REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
