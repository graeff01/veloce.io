import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1),
  objective: z.string().min(1),
  type: z.string().min(1),
  platform: z.string().min(1),
  vehicle: z.string().optional(),
  budget: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const winner = searchParams.get("winner");
  const platform = searchParams.get("platform");

  const campaigns = await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(winner === "true" ? { winner: true } : {}),
      ...(platform ? { platform } : {}),
    },
    include: {
      client: { select: { id: true, name: true, brand: true, niche: true } },
      metrics: { orderBy: { createdAt: "desc" }, take: 1 },
      creatives: { where: { winner: true }, take: 3 },
      insights: { where: { starred: true }, take: 3 },
      _count: { select: { creatives: true, insights: true } },
    },
    orderBy: [{ winner: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { startDate, endDate, tags, ...rest } = parsed.data;

  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      tags: tags ?? [],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
    include: {
      client: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
