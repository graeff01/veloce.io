-- Keep a single production admin user for the workspace.
-- Existing operational references are reassigned to avoid breaking task ownership and activity history.

INSERT INTO "User" (
    "id",
    "name",
    "email",
    "password",
    "role",
    "operationalRole",
    "active",
    "createdAt",
    "updatedAt",
    "deletedAt"
) VALUES (
    'user-douglas-veloce-admin',
    'Douglas',
    'douglas@velocebm.com',
    '$2b$12$mQRhnU7JBO7G0cCTXiSBc..CwplLpk/oaejgW6rETe5BxLtn1NMre',
    'ADMIN',
    'Founder',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    NULL
)
ON CONFLICT ("email") DO UPDATE SET
    "id" = 'user-douglas-veloce-admin',
    "name" = 'Douglas',
    "password" = EXCLUDED."password",
    "role" = 'ADMIN',
    "operationalRole" = 'Founder',
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP,
    "deletedAt" = NULL;

UPDATE "Task"
SET "assignedTo" = 'user-douglas-veloce-admin'
WHERE "assignedTo" IS NOT NULL
AND "assignedTo" <> 'user-douglas-veloce-admin';

UPDATE "ExecutionLog"
SET "userId" = 'user-douglas-veloce-admin'
WHERE "userId" <> 'user-douglas-veloce-admin';

UPDATE "ClientPlan"
SET "appliedBy" = 'user-douglas-veloce-admin'
WHERE "appliedBy" <> 'user-douglas-veloce-admin';

DELETE FROM "User"
WHERE "email" <> 'douglas@velocebm.com';
