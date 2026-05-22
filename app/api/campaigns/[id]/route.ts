import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  objective: z.string().optional(),
  type: z.string().optional(),
  platform: z.string().optional(),
  vehicle: z.string().optional(),
  budget: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "FINISHED", "ARCHIVED"]).optional(),
  winner: z.boolean().optional(),
  result: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // inline metric upsert
  metric: z.object({
    cpl: z.number().optional(),
    ctr: z.number().optional(),
    cpm: z.number().optional(),
    leads: z.number().int().optional(),
    retention: z.number().optional(),
    period: z.string().optional(),
  }).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: { select: { id: true, name: true, brand: true, niche: true } },
      metrics: { orderBy: { createdAt: "desc" } },
      creatives: { orderBy: [{ winner: "desc" }, { createdAt: "desc" }] },
      insights: { orderBy: [{ starred: "desc" }, { createdAt: "desc" }] },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { metric, startDate, endDate, ...rest } = parsed.data;

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...rest,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      ...(metric
        ? {
            metrics: {
              create: metric,
            },
          }
        : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      metrics: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json(campaign);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.campaign.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
