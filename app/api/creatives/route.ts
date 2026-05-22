import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1),
  hook: z.string().min(1),
  format: z.string().min(1),
  angle: z.string().optional(),
  style: z.string().optional(),
  retention: z.number().optional(),
  ctr: z.number().optional(),
  cpl: z.number().optional(),
  winner: z.boolean().optional(),
  starred: z.boolean().optional(),
  notes: z.string().optional(),
  mediaUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const winner = searchParams.get("winner");
  const starred = searchParams.get("starred");
  const format = searchParams.get("format");
  const angle = searchParams.get("angle");

  const creatives = await prisma.creative.findMany({
    where: {
      ...(campaignId ? { campaignId } : {}),
      ...(winner === "true" ? { winner: true } : {}),
      ...(starred === "true" ? { starred: true } : {}),
      ...(format ? { format } : {}),
      ...(angle ? { angle } : {}),
    },
    include: {
      campaign: {
        select: { id: true, name: true, client: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ winner: "desc" }, { starred: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(creatives);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const creative = await prisma.creative.create({
    data: { ...parsed.data, tags: parsed.data.tags ?? [] },
    include: {
      campaign: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(creative, { status: 201 });
}
