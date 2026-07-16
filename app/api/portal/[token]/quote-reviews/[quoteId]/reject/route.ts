import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — Vendedor REJEITA o auto-orçamento (algo errado) e assume a conversa: descarta o
// orçamento, PAUSA a IA no contato (takeover) e vira dono do lead. O PDF NÃO é enviado.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const me = await getPortalSessionEmail(portal.clientId);
  if (!me) return NextResponse.json({ error: "Faça login." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 500) : "";

  // Captura o orçamento ANTES de rejeitar (p/ registrar a correção com o contexto).
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, clientId: portal.clientId },
    select: { contactId: true, number: true, total: true, currency: true, summary: true, intake: true, items: true },
  });

  const rejected = await prisma.quote.updateMany({
    where: { id: quoteId, clientId: portal.clientId, status: "pending_review", reviewedByEmail: null },
    data: { status: "rejected", reviewedByEmail: me, reviewedAt: new Date() },
  });
  if (rejected.count === 0) return NextResponse.json({ error: "Este orçamento já foi revisado por outra pessoa." }, { status: 409 });

  if (quote) {
    // Takeover: pausa a IA e vira dono do lead (se ainda estiver sem dono).
    await prisma.waContact.update({ where: { id: quote.contactId }, data: { aiSilenced: true } }).catch(() => {});
    await prisma.waConversation.updateMany({ where: { contactId: quote.contactId, assignedEmail: null }, data: { assignedEmail: me, assignedAt: new Date() } }).catch(() => {});

    // APRENDIZADO: registra a correção — a IA errou este orçamento, segundo o vendedor.
    const intake = (quote.intake ?? null) as Record<string, unknown> | null;
    const wanted = intake
      ? Object.entries(intake).filter(([, v]) => typeof v === "string" && (v as string).trim()).map(([k, v]) => `${k}: ${v}`).join("; ")
      : null;
    const items = (Array.isArray(quote.items) ? quote.items : []) as { label?: string; amount?: number }[];
    const proposed = items.length
      ? `${items.map((i) => i.label).filter(Boolean).join(", ")} — total ${quote.total.toLocaleString("pt-BR", { style: "currency", currency: quote.currency || "BRL" })}`
      : (quote.summary ?? null);
    await prisma.aiCorrection.create({ data: {
      clientId: portal.clientId, contactId: quote.contactId, quoteId,
      kind: "quote_rejected", leadWanted: wanted, aiProposed: proposed,
      note: motivo || null, reviewerEmail: me,
    } }).catch(() => {});
  }
  return NextResponse.json({ ok: true, contactId: quote?.contactId ?? null });
}
