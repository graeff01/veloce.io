import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { renderQuotePdf } from "@/lib/quote-pdf";

export const runtime = "nodejs";

// GET — regenera o PDF de um orçamento e devolve os bytes (inline por padrão,
// ?dl=1 força download). O PDF não é armazenado: montamos a partir do registro Quote.
// Escopo: token→cliente→quote (isolamento entre clientes) + só se quotesEnabled.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse("link inválido", { status: 404 });

  const ai = await prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { quotesEnabled: true } });
  if (!ai?.quotesEnabled) return new NextResponse("indisponível", { status: 404 });

  const quote = await prisma.quote.findFirst({ where: { id: quoteId, clientId: portal.clientId } });
  if (!quote) return new NextResponse("não encontrado", { status: 404 });

  const [client, contact] = await Promise.all([
    prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true } }),
    prisma.waContact.findUnique({ where: { id: quote.contactId }, select: { displayName: true, name: true, waId: true } }),
  ]);

  const pdf = await renderQuotePdf({
    clientName: client?.name ?? "Orçamento",
    number: quote.number,
    contactName: contact?.displayName || contact?.name || contact?.waId || null,
    items: quote.items as unknown as { label: string; qty: number; unit: number; amount: number }[],
    subtotal: quote.subtotal,
    fees: quote.fees,
    total: quote.total,
    currency: quote.currency,
    summary: quote.summary,
    generatedAt: quote.createdAt.toLocaleDateString("pt-BR"),
  });

  const dl = new URL(req.url).searchParams.get("dl");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="orcamento-${quote.number}.pdf"`,
    },
  });
}
