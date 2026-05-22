import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  hook: z.string().optional(),
  format: z.string().optional(),
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const creative = await prisma.creative.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(creative);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.creative.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
