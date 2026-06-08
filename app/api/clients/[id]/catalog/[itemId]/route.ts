import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  price: z.number().nonnegative().nullable().optional(),
  available: z.boolean().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable().optional(),
  url: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;
  const res = await prisma.catalogItem.updateMany({
    where: { id: itemId, clientId: id },
    data: { ...d, attributes: d.attributes === undefined ? undefined : d.attributes ?? undefined, syncedAt: new Date() },
  });
  if (res.count === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  await prisma.catalogItem.deleteMany({ where: { id: itemId, clientId: id } });
  return NextResponse.json({ ok: true });
}
