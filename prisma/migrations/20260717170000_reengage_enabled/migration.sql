-- Follow-up/re-engajamento ligável por cliente (JR pediu SEM follow-up).
ALTER TABLE "AiAgentConfig" ADD COLUMN IF NOT EXISTS "reengageEnabled" BOOLEAN NOT NULL DEFAULT true;
