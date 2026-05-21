import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  frequency: z.string().optional(),
  intensity: z.string().optional(),
  averageDeadlineDays: z.number().min(0).optional(),
  reviewDays: z.number().min(0).optional(),
  demandLimit: z.number().min(0).optional(),
  items: z.array(
    z.object({
      type: z.string().min(1),
      quantity: z.number().min(1),
      description: z.string().optional(),
    })
  ).min(1),
});

export async function GET() {
  const { error } = await requireAuth("plans:read");
  if (error) return error;

  const plans = await prisma.plan.findMany({
    where: { deletedAt: null },
    include: {
      items: true,
      _count: { select: { clientPlans: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(plans);
}

export async function POST(req: Request) {
  const { error, session } = await requireAuth("plans:create");
  if (error) return error;

  const body = await req.json();
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const plan = await prisma.plan.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category || null,
      frequency: parsed.data.frequency || null,
      intensity: parsed.data.intensity || null,
      averageDeadlineDays: parsed.data.averageDeadlineDays ?? null,
      reviewDays: parsed.data.reviewDays ?? null,
      demandLimit: parsed.data.demandLimit ?? null,
      items: { create: parsed.data.items },
    },
    include: { items: true },
  });

  await logAction(session!.user.id, "CREATE_PLAN", undefined, undefined, { name: plan.name });

  return NextResponse.json(plan, { status: 201 });
}
