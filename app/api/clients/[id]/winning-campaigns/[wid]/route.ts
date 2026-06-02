import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  name:        z.string().min(1).optional(),
  tags:        z.array(z.string()).optional(),
  spend:       z.number().optional(),
  leads:       z.number().int().optional(),
  cpl:         z.number().optional(),
  ctr:         z.number().optional(),
  reach:       z.number().int().optional(),
  roas:        z.number().optional(),
  whatWorked:  z.string().nullable().optional(),
  audience:    z.string().nullable().optional(),
  creativeUrl: z.string().nullable().optional(),
  nextSteps:   z.string().nullable().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; wid: string }> }) {
  const { wid } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const campaign = await prisma.winningCampaign.update({
    where: { id: wid },
    data: parsed.data,
  });

  return NextResponse.json(campaign);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; wid: string }> }) {
  const { wid } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  await prisma.winningCampaign.delete({ where: { id: wid } });
  return NextResponse.json({ ok: true });
}
