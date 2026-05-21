-- Move the product away from generic plans and into client-owned operational scope.

ALTER TABLE "Client"
ADD COLUMN IF NOT EXISTS "operationalScope" JSONB,
ADD COLUMN IF NOT EXISTS "reviewDay" TEXT,
ADD COLUMN IF NOT EXISTS "expectedSla" TEXT,
ADD COLUMN IF NOT EXISTS "meetingFrequency" TEXT,
ADD COLUMN IF NOT EXISTS "approvalRoutine" TEXT,
ADD COLUMN IF NOT EXISTS "operationalUrgency" TEXT,
ADD COLUMN IF NOT EXISTS "importantLinks" TEXT;

-- User requested a clean production workspace: remove current clients, plans and linked operational records.
DELETE FROM "Checklist";

DELETE FROM "ExecutionLog"
WHERE "clientId" IS NOT NULL
OR "taskId" IS NOT NULL
OR "action" IN ('CREATE_CLIENT', 'UPDATE_CLIENT', 'DELETE_CLIENT', 'CREATE_TASK', 'UPDATE_STATUS', 'DELETE_TASK', 'APPLY_PLAN', 'CREATE_PLAN', 'ADD_NOTE');

DELETE FROM "Task";
DELETE FROM "ClientPlan";
DELETE FROM "Client";
DELETE FROM "PlanItem";
DELETE FROM "Plan";
