import { prisma } from "@/lib/prisma";
import { DELIVERABLE_DEFAULTS, calcDueDate } from "@/lib/deliverable-defaults";

export { DELIVERABLE_DEFAULTS, calcDueDate };

interface PlanItemWithDefaults {
  id: string;
  type: string;
  quantity: number;
  deadlineDayOfMonth: number | null;
  defaultPriority: string;
  checklistItems: string[];
}

export function buildTasksFromPlanItems(
  clientId: string,
  planMonth: number,
  planYear: number,
  items: PlanItemWithDefaults[],
  appliedBy?: string
) {
  const tasks: {
    clientId: string;
    title: string;
    type: string;
    dueDate: Date;
    priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
    planMonth: number;
    planYear: number;
    assignedTo: null;
  }[] = [];

  for (const item of items) {
    // Merge defaults if item fields are empty
    const defaults = DELIVERABLE_DEFAULTS[item.type] ?? {};
    const deadline = item.deadlineDayOfMonth ?? defaults.deadlineDayOfMonth ?? 15;
    const priority = (item.defaultPriority || defaults.priority || "NORMAL") as
      "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

    for (let i = 1; i <= item.quantity; i++) {
      const dueDate = calcDueDate(planYear, planMonth, deadline);
      tasks.push({
        clientId,
        title: item.quantity === 1 ? item.type : `${item.type} ${i}`,
        type: item.type,
        dueDate,
        priority,
        planMonth,
        planYear,
        assignedTo: null,
      });
    }
  }

  return tasks;
}

export async function createTasksWithChecklists(
  rawTasks: ReturnType<typeof buildTasksFromPlanItems>,
  items: PlanItemWithDefaults[]
) {
  const created = await Promise.all(
    rawTasks.map((t) =>
      prisma.task.create({
        data: t,
      })
    )
  );

  // Attach checklist items per type
  const checklistCreates: Promise<unknown>[] = [];
  for (const task of created) {
    const taskType = task.type ?? "";
    const item = items.find((i) => i.type === taskType);
    const defaults = DELIVERABLE_DEFAULTS[taskType] ?? {};
    const checklistItems: string[] =
      item?.checklistItems?.length ? item.checklistItems : defaults.checklistItems ?? [];

    checklistItems.forEach((text: string, order: number) => {
      checklistCreates.push(
        prisma.checklist.create({
          data: { taskId: task.id, text, done: false, order },
        })
      );
    });
  }

  await Promise.all(checklistCreates);
  return created;
}

/**
 * Lazy auto-renewal: called on client page load.
 * If the active ClientPlan has autoRenew=true and no tasks exist for current month, generates them.
 */
export async function maybeAutoRenew(clientId: string): Promise<boolean> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const activePlan = await prisma.clientPlan.findFirst({
    where: { clientId, active: true, autoRenew: true },
    orderBy: { appliedAt: "desc" },
    include: {
      plan: {
        include: { items: true },
      },
    },
  });

  if (!activePlan) return false;

  // Check if tasks already exist for current month
  const existingCount = await prisma.task.count({
    where: {
      clientId,
      deletedAt: null,
      planMonth: currentMonth,
      planYear: currentYear,
    },
  });

  if (existingCount > 0) return false;

  // Generate tasks for this month
  const rawTasks = buildTasksFromPlanItems(
    clientId,
    currentMonth,
    currentYear,
    activePlan.plan.items
  );

  await createTasksWithChecklists(rawTasks, activePlan.plan.items);

  // Update ClientPlan month/year to reflect current cycle
  await prisma.clientPlan.update({
    where: { id: activePlan.id },
    data: { month: currentMonth, year: currentYear },
  });

  return true;
}
