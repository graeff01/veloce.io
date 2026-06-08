import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { slotsForDate, DEFAULT_WINDOWS, type VisitCfg, type Window } from "@/lib/visit-availability";
import { wallToInstant } from "@/lib/tz";

// GET ?date=AAAA-MM-DD — horários livres do dia (janelas - ocupados, com capacidade), no fuso do tenant.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return NextResponse.json({ error: "date inválido (AAAA-MM-DD)" }, { status: 400 });

  const c = await prisma.visitConfig.findUnique({ where: { clientId: id } });
  const tz = c?.timezone || "America/Sao_Paulo";
  const cfg: VisitCfg = c
    ? { slotMinutes: c.slotMinutes, capacityPerSlot: c.capacityPerSlot, windows: (c.windows as unknown as Window[]) ?? DEFAULT_WINDOWS }
    : { slotMinutes: 60, capacityPerSlot: 1, windows: DEFAULT_WINDOWS };

  const dayStart = wallToInstant(dateStr, "00:00", tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const booked = await prisma.visit.findMany({
    where: { clientId: id, scheduledAt: { gte: dayStart, lt: dayEnd } }, select: { scheduledAt: true },
  });
  return NextResponse.json({ date: dateStr, slots: slotsForDate(cfg, dateStr, booked.map((b) => b.scheduledAt), tz) });
}
