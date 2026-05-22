import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  content: z.string().optional(),
  type: z.enum(["OBSERVATION", "PATTERN", "WARNING", "WINNING_STRATEGY", "HYPOTHESIS"]).optional(),
  starred: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  // discriminator
  scope: z.enum(["global", "campaign"]).default("global"),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { scope, ...data } = parsed.data;

  if (scope === "campaign") {
    const insight = await prisma.campaignInsight.update({ where: { id }, data });
    return NextResponse.json(insight);
  }

  const insight = await prisma.globalInsight.update({ where: { id }, data });
  return NextResponse.json(insight);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");

  if (scope === "campaign") {
    await prisma.campaignInsight.delete({ where: { id } });
  } else {
    await prisma.globalInsight.delete({ where: { id } });
  }

  return NextResponse.json({ ok: true });
}
