import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

// Memória do agente por lead (grupo Construir) — Sprint 1.
// Duas camadas, ambas reais e separadas do aiSummary do CRM:
//  • rolling summary  → WaConversation.agentMemory (resumo de trabalho da IA)
//  • fatos de longo prazo → LeadProfile estruturado (interesse/orçamento/troca/…)
// Escopo por clientId via WaConnection (LeadProfile/WaConversation são por connectionId).

interface Fact { key: string; value: string; updatedAt: string | null }

type ProfileRow = {
  productInterest: string | null; budget: string | null;
  wantsFinancing: boolean | null; financingDetail: string | null;
  hasTradeIn: boolean | null; tradeInDetail: string | null;
  urgency: string | null; visitIntent: boolean | null;
  readyToBuy: boolean | null; lastSentiment: string | null;
  updatedAt: Date;
};

const PROFILE_SELECT = {
  productInterest: true, budget: true, wantsFinancing: true, financingDetail: true,
  hasTradeIn: true, tradeInDetail: true, urgency: true, visitIntent: true,
  readyToBuy: true, lastSentiment: true, updatedAt: true,
} as const;

const yn = (b: boolean) => (b ? "sim" : "não");
const truncate = (s: string | null, n = 160) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s ?? "");

// Deriva os fatos estruturados do perfil → lista key/value (só o que está preenchido).
function profileFacts(p: ProfileRow | null | undefined): Fact[] {
  if (!p) return [];
  const at = p.updatedAt.toISOString();
  const f: Fact[] = [];
  const push = (key: string, value: string | null | undefined) => { if (value != null && value !== "") f.push({ key, value, updatedAt: at }); };
  push("interesse", p.productInterest);
  push("orçamento", p.budget);
  if (p.wantsFinancing != null) push("financiamento", p.financingDetail ? `${yn(p.wantsFinancing)} — ${p.financingDetail}` : yn(p.wantsFinancing));
  if (p.hasTradeIn != null) push("troca", p.tradeInDetail ? `${yn(p.hasTradeIn)} — ${p.tradeInDetail}` : yn(p.hasTradeIn));
  push("urgência", p.urgency);
  if (p.visitIntent != null) push("visita", yn(p.visitIntent));
  if (p.readyToBuy != null) push("pronto para fechar", yn(p.readyToBuy));
  push("sentimento", p.lastSentiment);
  return f;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conns = await prismaUnscoped.waConnection.findMany({ where: { clientId: id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);
  if (connIds.length === 0) return NextResponse.json({ leads: [] });

  const contactId = new URL(req.url).searchParams.get("contactId");

  // Detalhe de um lead: memória rolante completa + fatos estruturados.
  if (contactId) {
    const convo = await prismaUnscoped.waConversation.findFirst({
      where: { contactId, connectionId: { in: connIds } },
      select: { contactId: true, agentMemory: true },
    });
    if (!convo) return NextResponse.json({ leads: [], detail: null });
    const profile = await prismaUnscoped.leadProfile.findFirst({
      where: { contactId, connectionId: { in: connIds } }, select: PROFILE_SELECT,
    });
    return NextResponse.json({
      leads: [],
      detail: {
        contactId: convo.contactId,
        summary: truncate(convo.agentMemory),
        rollingSummary: convo.agentMemory ?? "",
        facts: profileFacts(profile),
      },
    });
  }

  // Lista: leads com memória persistida (agentMemory != null) + resumo.
  const convos = await prismaUnscoped.waConversation.findMany({
    where: { connectionId: { in: connIds }, agentMemory: { not: null } },
    select: {
      contactId: true, agentMemory: true, agentMemoryAt: true, lastMessageAt: true,
      contact: { select: { name: true, displayName: true } },
    },
    orderBy: { agentMemoryAt: "desc" }, take: 200,
  });

  const ids = convos.map((c) => c.contactId);
  const profiles = ids.length
    ? await prismaUnscoped.leadProfile.findMany({ where: { contactId: { in: ids }, connectionId: { in: connIds } }, select: { contactId: true, ...PROFILE_SELECT } })
    : [];
  const byContact = new Map(profiles.map((p) => [p.contactId, p]));

  const leads = convos.map((c) => ({
    contactId: c.contactId,
    name: c.contact?.displayName || c.contact?.name || null,
    lastSeen: (c.agentMemoryAt ?? c.lastMessageAt)?.toISOString() ?? null,
    summary: truncate(c.agentMemory),
    factsCount: profileFacts(byContact.get(c.contactId)).length,
  }));

  return NextResponse.json({ leads });
}
