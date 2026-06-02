import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const schema = z.object({
  month:       z.number().int().min(1).max(12),
  year:        z.number().int().min(2020),
  name:        z.string().min(1),
  platform:    z.string().default("Meta Ads"),
  tags:        z.array(z.string()).default([]),
  spend:       z.number().default(0),
  leads:       z.number().int().default(0),
  cpl:         z.number().default(0),
  ctr:         z.number().default(0),
  reach:       z.number().int().default(0),
  roas:        z.number().default(0),
  whatWorked:  z.string().optional().nullable(),
  audience:    z.string().optional().nullable(),
  creativeUrl: z.string().optional().nullable(),
  nextSteps:   z.string().optional().nullable(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const campaigns = await prisma.winningCampaign.findMany({
    where: { clientId: id },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(campaigns);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });

  const campaign = await prisma.winningCampaign.create({
    data: { clientId: id, ...parsed.data },
  });

  return NextResponse.json(campaign, { status: 201 });
}
