import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { countLeadThemes } from "@/lib/lead-themes";

export const runtime = "nodejs";

// GET /api/clients/[id]/competitors/bridge
// A PONTE: cruza o que os leads do WhatsApp mais puxam (rule-based) com os ângulos
// que você tem de vencedor no swipe → recomenda o próximo criativo a testar.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conns = await prisma.waConnection.findMany({ where: { clientId: id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);

  const since = new Date(Date.now() - 90 * 86_400_000);
  const msgs = connIds.length
    ? await prisma.waMessage.findMany({
        where: { connectionId: { in: connIds }, direction: "in", text: { not: null }, timestamp: { gte: since } },
        select: { text: true },
        take: 5000,
        orderBy: { timestamp: "desc" },
      })
    : [];
  const themes = countLeadThemes(msgs.map((m) => m.text));

  // vencedores por ângulo (contagem + maior longevidade)
  const winners = await prisma.winningCreative.findMany({ where: { clientId: id }, select: { angle: true, liveSince: true } });
  const now = Date.now();
  const winnersByAngle: Record<string, { count: number; maxDays: number | null }> = {};
  for (const w of winners) {
    const cur = winnersByAngle[w.angle] ?? { count: 0, maxDays: null };
    cur.count += 1;
    if (w.liveSince) {
      const d = Math.max(0, Math.round((now - new Date(w.liveSince).getTime()) / 86_400_000));
      cur.maxDays = Math.max(cur.maxDays ?? 0, d);
    }
    winnersByAngle[w.angle] = cur;
  }

  // ranking dos temas que os leads mais puxam
  const ranked = Object.entries(themes).sort((a, b) => b[1] - a[1]);
  const recommendations = ranked.slice(0, 4).map(([angle, count]) => {
    const w = winnersByAngle[angle];
    if (w && w.count > 0) {
      return { angle, count, kind: "modelar" as const, winners: w.count, maxDays: w.maxDays };
    }
    return { angle, count, kind: "gap" as const, winners: 0, maxDays: null };
  });

  return NextResponse.json({
    totalLeadMsgs: msgs.length,
    hasMessages: msgs.length > 0,
    themes,
    winnersByAngle,
    recommendations,
  });
}
