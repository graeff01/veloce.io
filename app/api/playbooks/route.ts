import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const stepSchema = z.object({
  order: z.number().int(),
  title: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  niche: z.string().optional(),
  vehicleType: z.string().optional(),
  objective: z.string().optional(),
  platform: z.string().optional(),
  summary: z.string().min(1),
  starred: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(stepSchema).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const niche = searchParams.get("niche");
  const platform = searchParams.get("platform");
  const starred = searchParams.get("starred");

  const playbooks = await prisma.playbook.findMany({
    where: {
      ...(niche ? { niche } : {}),
      ...(platform ? { platform } : {}),
      ...(starred === "true" ? { starred: true } : {}),
    },
    include: {
      steps: { orderBy: { order: "asc" } },
    },
    orderBy: [{ starred: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json(playbooks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { steps, tags, ...rest } = parsed.data;

  const playbook = await prisma.playbook.create({
    data: {
      ...rest,
      tags: tags ?? [],
      steps: steps ? { create: steps } : undefined,
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(playbook, { status: 201 });
}
