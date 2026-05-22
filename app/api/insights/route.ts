import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  content: z.string().min(1),
  type: z.enum(["OBSERVATION", "PATTERN", "WARNING", "WINNING_STRATEGY", "HYPOTHESIS"]).optional(),
  niche: z.string().optional(),
  vehicleType: z.string().optional(),
  platform: z.string().optional(),
  starred: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  // se vier de uma campanha
  campaignId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const starred = searchParams.get("starred");
  const type = searchParams.get("type");
  const niche = searchParams.get("niche");
  const platform = searchParams.get("platform");

  const [global, campaign] = await Promise.all([
    prisma.globalInsight.findMany({
      where: {
        ...(starred === "true" ? { starred: true } : {}),
        ...(type ? { type: type as never } : {}),
        ...(niche ? { niche } : {}),
        ...(platform ? { platform } : {}),
      },
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
    }),
    prisma.campaignInsight.findMany({
      where: {
        ...(starred === "true" ? { starred: true } : {}),
        ...(type ? { type: type as never } : {}),
      },
      include: {
        campaign: { select: { id: true, name: true, client: { select: { name: true } } } },
      },
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return NextResponse.json({ global, campaign });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, ...data } = parsed.data;

  if (campaignId) {
    const insight = await prisma.campaignInsight.create({
      data: {
        campaignId,
        content: data.content,
        type: data.type ?? "OBSERVATION",
        starred: data.starred ?? false,
        tags: data.tags ?? [],
      },
    });
    return NextResponse.json(insight, { status: 201 });
  }

  const insight = await prisma.globalInsight.create({
    data: {
      content: data.content,
      type: data.type ?? "OBSERVATION",
      niche: data.niche,
      vehicleType: data.vehicleType,
      platform: data.platform,
      starred: data.starred ?? false,
      tags: data.tags ?? [],
      source: data.source,
    },
  });

  return NextResponse.json(insight, { status: 201 });
}
