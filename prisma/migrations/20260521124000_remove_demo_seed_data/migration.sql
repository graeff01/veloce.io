-- Remove known demo seed records without touching real operational records.
DELETE FROM "Checklist"
WHERE "taskId" IN (
    SELECT "id" FROM "Task"
    WHERE "clientId" IN (
        SELECT "id" FROM "Client"
        WHERE "slug" IN ('marca-alpha', 'startup-beta', 'loja-gamma')
    )
);

DELETE FROM "ExecutionLog"
WHERE "clientId" IN (
    SELECT "id" FROM "Client"
    WHERE "slug" IN ('marca-alpha', 'startup-beta', 'loja-gamma')
)
OR "taskId" IN (
    SELECT "id" FROM "Task"
    WHERE "clientId" IN (
        SELECT "id" FROM "Client"
        WHERE "slug" IN ('marca-alpha', 'startup-beta', 'loja-gamma')
    )
);

DELETE FROM "Task"
WHERE "clientId" IN (
    SELECT "id" FROM "Client"
    WHERE "slug" IN ('marca-alpha', 'startup-beta', 'loja-gamma')
);

DELETE FROM "ClientPlan"
WHERE "clientId" IN (
    SELECT "id" FROM "Client"
    WHERE "slug" IN ('marca-alpha', 'startup-beta', 'loja-gamma')
)
OR "planId" IN ('plan-essencial', 'plan-pro');

DELETE FROM "Client"
WHERE "slug" IN ('marca-alpha', 'startup-beta', 'loja-gamma');

DELETE FROM "PlanItem"
WHERE "planId" IN ('plan-essencial', 'plan-pro');

DELETE FROM "ExecutionLog"
WHERE "action" = 'CREATE_PLAN'
AND "details"::text SIMILAR TO '%(Plano Essencial|Plano Pro)%';

DELETE FROM "Plan"
WHERE "id" IN ('plan-essencial', 'plan-pro');
