import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { DEFAULT_WINDOWS } from "@/lib/visit-availability";
import { z } from "zod";

const windowSchema = z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() });
const putSchema = z.object({
  slotMinutes: z.number().int().min(10).max(240).optional(),
  capacityPerSlot: z.number().int().min(1).max(50).optional(),
  windows: z.array(windowSchema).optional(),
  timezone: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const cfg = await prisma.visitConfig.findUnique({ where: { clientId: id } });
  return NextResponse.json(cfg ?? { clientId: id, slotMinutes: 60, capacityPerSlot: 1, windows: DEFAULT_WINDOWS, timezone: "America/Sao_Paulo" });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;
  const cfg = await prisma.visitConfig.upsert({
    where: { clientId: id },
    create: { clientId: id, ...d, windows: d.windows ?? DEFAULT_WINDOWS },
    update: d,
  });
  return NextResponse.json(cfg);
}
