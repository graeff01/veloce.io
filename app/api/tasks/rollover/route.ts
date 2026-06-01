import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// POST /api/tasks/rollover
// Archives (soft-deletes) all DONE tasks from months prior to the current month.
// Called automatically by the kanban when viewing the current month.
// Tasks remain visible in the calendar (filtered by dueDate), just hidden from the kanban.
export async function POST() {
  const { error } = await requireAuth("tasks:update");
  if (error) return error;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const result = await prisma.task.updateMany({
    where: {
      deletedAt: null,
      status: "DONE",
      OR: [
        // planMonth/planYear set and in a past month
        {
          planYear: { lt: currentYear },
        },
        {
          planYear: currentYear,
          planMonth: { lt: currentMonth },
        },
      ],
    },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ archived: result.count });
}
