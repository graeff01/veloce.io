import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  niche: z.string().optional(),
  vehicleType: z.string().optional(),
  objective: z.string().optional(),
  platform: z.string().optional(),
  summary: z.string().optional(),
  starred: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const playbook = await prisma.playbook.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(playbook);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const playbook = await prisma.playbook.update({
    where: { id },
    data: parsed.data,
    include: { steps: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(playbook);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.playbook.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
