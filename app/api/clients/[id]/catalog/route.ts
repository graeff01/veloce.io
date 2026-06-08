import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  price: z.number().nonnegative().nullable().optional(),
  available: z.boolean().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  url: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  externalId: z.string().trim().max(120).nullable().optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const items = await prisma.catalogItem.findMany({
    where: { clientId: id, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: [{ available: "desc" }, { updatedAt: "desc" }],
    take: 300,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;
  const item = await prisma.catalogItem.create({
    data: {
      clientId: id, title: d.title, price: d.price ?? null, available: d.available ?? true,
      attributes: d.attributes ?? undefined, url: d.url || null, imageUrl: d.imageUrl || null,
      externalId: d.externalId || null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
