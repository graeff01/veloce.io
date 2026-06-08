import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { slotsForDate, DEFAULT_WINDOWS, type VisitCfg } from "@/lib/visit-availability";

// GET ?date=AAAA-MM-DD — horários livres do dia (janelas - ocupados, com capacidade).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "date obrigatório" }, { status: 400 });
  const date = new Date(`${dateStr}T12:00:00`);
  if (isNaN(date.getTime())) return NextResponse.json({ error: "data inválida" }, { status: 400 });

  const c = await prisma.visitConfig.findUnique({ where: { clientId: id } });
  const cfg: VisitCfg = c
    ? { slotMinutes: c.slotMinutes, capacityPerSlot: c.capacityPerSlot, windows: (c.windows as unknown as VisitCfg["windows"]) ?? DEFAULT_WINDOWS }
    : { slotMinutes: 60, capacityPerSlot: 1, windows: DEFAULT_WINDOWS };

  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);
  const booked = await prisma.visit.findMany({
    where: { clientId: id, scheduledAt: { gte: dayStart, lt: dayEnd } }, select: { scheduledAt: true },
  });
  return NextResponse.json({ date: dateStr, slots: slotsForDate(cfg, date, booked.map((b) => b.scheduledAt)) });
}
