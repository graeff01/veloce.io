-- AlterTable (idempotent)
DO $$ BEGIN
  ALTER TABLE "Task" ADD COLUMN "meetingId" TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
