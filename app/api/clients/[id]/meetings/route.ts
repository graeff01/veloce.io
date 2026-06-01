import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  title:        z.string().min(1),
  date:         z.string(),
  participants: z.array(z.string()).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const meetings = await prisma.meeting.findMany({
    where: { clientId: id },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(meetings);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const meeting = await prisma.meeting.create({
    data: {
      clientId:     id,
      title:        parsed.data.title,
      date:         new Date(parsed.data.date),
      participants: parsed.data.participants ?? [],
    },
  });

  return NextResponse.json(meeting, { status: 201 });
}
