import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  const { checkId } = await params;
  const { error } = await requireAuth("checklist:update");
  if (error) return error;

  const body = await req.json();
  const item = await prisma.checklist.update({
    where: { id: checkId },
    data: { done: body.done },
  });

  return NextResponse.json(item);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  const { checkId } = await params;
  const { error } = await requireAuth("checklist:update");
  if (error) return error;

  await prisma.checklist.delete({ where: { id: checkId } });
  return NextResponse.json({ ok: true });
}
