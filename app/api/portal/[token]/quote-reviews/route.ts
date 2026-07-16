import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — Fila de REVISÃO: orçamentos aguardando o aval de um vendedor antes de ir ao lead
// (modo revisão). Retorna os cards + a contagem de pendentes (badge/sino). Só com sessão.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const me = await getPortalSessionEmail(portal.clientId);

  const quotes = await prisma.quote.findMany({
    where: { clientId: portal.clientId, status: "pending_review" },
    orderBy: { submittedAt: "asc" }, // mais antigo primeiro (SLA)
    take: 100,
    select: { id: true, number: true, total: true, currency: true, summary: true, intake: true, items: true, contactId: true, submittedAt: true, createdAt: true },
  });
  if (!quotes.length) return NextResponse.json({ reviews: [], pending: 0, me });

  const contacts = await prisma.waContact.findMany({
    where: { id: { in: quotes.map((q) => q.contactId) } },
    select: { id: true, name: true, displayName: true, waId: true },
  });
  const cById = new Map(contacts.map((c) => [c.id, c]));

  const reviews = quotes.map((q) => {
    const ct = cById.get(q.contactId);
    const intake = (q.intake ?? null) as Record<string, unknown> | null;
    const str = (k: string) => (intake && typeof intake[k] === "string" && (intake[k] as string).trim() ? (intake[k] as string).trim() : null);
    const install = str("local_instalacao");
    const opcionais = str("opcionais");
    const resumo = [install && `instalação: ${install}`, opcionais && opcionais.toLowerCase() !== "nenhum" && `opcionais: ${opcionais}`].filter(Boolean).join(" · ") || null;
    const items = (Array.isArray(q.items) ? q.items : []) as { label?: string; amount?: number }[];
    return {
      quoteId: q.id,
      number: q.number,
      contactId: q.contactId,
      name: ct?.displayName?.trim() || ct?.name?.trim() || ct?.waId || "Lead",
      total: q.total,
      currency: q.currency,
      summary: q.summary,
      resumo,
      city: str("cidade_entrega"),
      nome: str("nome"),
      lines: items.map((i) => ({ label: i.label ?? "", amount: typeof i.amount === "number" ? i.amount : 0 })),
      submittedAt: q.submittedAt ?? q.createdAt,
    };
  });
  return NextResponse.json({ reviews, pending: reviews.length, me });
}
