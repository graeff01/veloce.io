import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — Fila de Fechamento: leads com orçamento APROVADO pelo cliente (quer fechar), ainda
// abertos. Retorna os cards (sem dono + os que são meus) + a contagem de "esperando" (sem
// dono) para o sino/badge. Só quem tem sessão no portal vê.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const me = await getPortalSessionEmail(portal.clientId);

  const connIds = (await prisma.waConnection.findMany({ where: { clientId: portal.clientId }, select: { id: true } })).map((c) => c.id);
  if (!connIds.length) return NextResponse.json({ leads: [], unclaimed: 0, me });

  const convs = await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, quoteApprovedAt: { not: null }, closedAt: null },
    orderBy: { quoteApprovedAt: "asc" }, // mais antigo primeiro (SLA)
    take: 100,
    select: { contactId: true, quoteApprovedAt: true, assignedEmail: true },
  });
  if (!convs.length) return NextResponse.json({ leads: [], unclaimed: 0, me });

  const contactIds = convs.map((c) => c.contactId);
  const [contacts, quotes, owners] = await Promise.all([
    prisma.waContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, displayName: true, waId: true } }),
    prisma.quote.findMany({ where: { clientId: portal.clientId, contactId: { in: contactIds } }, orderBy: { createdAt: "desc" },
      select: { contactId: true, number: true, total: true, currency: true, summary: true, intake: true } }),
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, select: { email: true, name: true } }),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const ownerName = new Map(owners.map((o) => [o.email, o.name || o.email]));
  const qByContact = new Map<string, (typeof quotes)[number]>();
  for (const q of quotes) if (!qByContact.has(q.contactId)) qByContact.set(q.contactId, q); // o mais recente (já ordenado desc)

  const leads = convs.map((c) => {
    const ct = cById.get(c.contactId);
    const q = qByContact.get(c.contactId);
    const intake = (q?.intake ?? null) as Record<string, unknown> | null;
    const str = (k: string) => (intake && typeof intake[k] === "string" && (intake[k] as string).trim() ? (intake[k] as string).trim() : null);
    const city = str("cidade_entrega");
    // Resumo pro vendedor (deterministico, sem LLM): local de instalação + opcionais.
    const install = str("local_instalacao");
    const opcionais = str("opcionais");
    const resumo = [install && `instalação: ${install}`, opcionais && opcionais.toLowerCase() !== "nenhum" && `opcionais: ${opcionais}`].filter(Boolean).join(" · ") || null;
    return {
      contactId: c.contactId,
      name: ct?.displayName?.trim() || ct?.name?.trim() || ct?.waId || "Lead",
      waId: ct?.waId ?? null,
      approvedAt: c.quoteApprovedAt,
      quoteNumber: q?.number ?? null,
      total: q?.total ?? null,
      currency: q?.currency ?? "BRL",
      summary: q?.summary ?? null,
      resumo,
      city,
      ownerEmail: c.assignedEmail,
      ownerName: c.assignedEmail ? ownerName.get(c.assignedEmail) ?? c.assignedEmail : null,
      mine: !!(me && c.assignedEmail === me),
    };
  });
  const unclaimed = leads.filter((l) => !l.ownerEmail).length;
  return NextResponse.json({ leads, unclaimed, me });
}
