import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  title:        z.string().min(1).optional(),
  date:         z.string().optional(),
  description:  z.string().optional().nullable(),
  duration:     z.number().optional(),
  transcript:   z.string().optional(),
  summary:      z.string().optional(),
  decisions:    z.array(z.string()).optional(),
  nextSteps:    z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const meeting = await prisma.meeting.update({
    where: { id },
    data: {
      ...(parsed.data.title        !== undefined && { title: parsed.data.title }),
      ...(parsed.data.date         !== undefined && { date: new Date(parsed.data.date) }),
      ...(parsed.data.description  !== undefined && { description: parsed.data.description }),
      ...(parsed.data.duration     !== undefined && { duration: parsed.data.duration }),
      ...(parsed.data.transcript   !== undefined && { transcript: parsed.data.transcript }),
      ...(parsed.data.summary      !== undefined && { summary: parsed.data.summary }),
      ...(parsed.data.decisions    !== undefined && { decisions: parsed.data.decisions }),
      ...(parsed.data.nextSteps    !== undefined && { nextSteps: parsed.data.nextSteps }),
      ...(parsed.data.participants !== undefined && { participants: parsed.data.participants }),
    },
  });

  return NextResponse.json(meeting);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  await prisma.meeting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
