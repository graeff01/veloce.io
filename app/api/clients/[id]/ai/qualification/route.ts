import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { slotState, scoreLead, type SlotKey, type ProfileLike } from "@/lib/ai-agent/scoring";

export const runtime = "nodejs";

// Qualificação por lead (grupo Inteligência) — Sprint 2.
// Reusa a verdade determinística do scoring.ts (slots + score v2) sobre LeadProfile.
// Escopo por clientId via WaConnection.

const ALL_SLOTS: SlotKey[] = ["interesse", "orcamento", "financiamento", "troca", "urgencia", "visita"];

// Valor exibível de cada slot a partir do perfil (null = não preenchido).
const SLOT_VALUE: Record<SlotKey, (p: ProfileLike) => string | null> = {
  interesse: (p) => p.productInterest ?? null,
  orcamento: (p) => p.budget ?? null,
  financiamento: (p) => (p.wantsFinancing == null ? null : p.wantsFinancing ? "sim" : "não"),
  troca: (p) => (p.hasTradeIn == null ? null : p.hasTradeIn ? "sim" : "não"),
  urgencia: (p) => p.urgency ?? null,
  visita: (p) => (p.readyToBuy ? "quer fechar" : p.visitIntent ? "quer visitar" : p.visitIntent === false || p.readyToBuy === false ? "não" : null),
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days") || 30)));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const conns = await prismaUnscoped.waConnection.findMany({ where: { clientId: id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);
  if (connIds.length === 0) return NextResponse.json({ leads: [], distribution: { cold: 0, warm: 0, hot: 0 } });

  const profiles = await prismaUnscoped.leadProfile.findMany({
    where: { connectionId: { in: connIds }, updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" }, take: 500,
  });

  const ids = profiles.map((p) => p.contactId);
  const contacts = ids.length
    ? await prismaUnscoped.waContact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, displayName: true } })
    : [];
  const nameOf = new Map(contacts.map((c) => [c.id, c.displayName || c.name || null]));

  const distribution = { cold: 0, warm: 0, hot: 0 };
  const leads = profiles.map((p) => {
    const { filled } = slotState(p);
    const filledSet = new Set(filled);
    const { score, temperature } = scoreLead(p);
    distribution[temperature]++;
    return {
      contactId: p.contactId,
      name: nameOf.get(p.contactId) ?? null,
      score,
      temperature,
      slots: ALL_SLOTS.map((k) => ({ key: k, value: SLOT_VALUE[k](p), filled: filledSet.has(k) })),
      missingSlots: ALL_SLOTS.filter((k) => !filledSet.has(k)),
      updatedAt: p.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({ leads, distribution });
}
