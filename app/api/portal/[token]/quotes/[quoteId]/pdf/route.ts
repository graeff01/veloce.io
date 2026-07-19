import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { renderQuotePdf } from "@/lib/quote-pdf";
import { buildQuoteDocData, type QuoteLineIn } from "@/lib/ai-agent/tools";

export const runtime = "nodejs";

// GET — regenera o PDF de um orçamento e devolve os bytes (inline; ?dl=1 força download).
// O PDF não é armazenado: é remontado a partir do registro Quote com o MESMO layout que
// a IA usa (buildQuoteDocData → renderQuotePdf). Escopo: token→cliente→quote (isolado) +
// só se quotesEnabled.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse("link inválido", { status: 404 });

  const ai = await prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { quotesEnabled: true } });
  if (!ai?.quotesEnabled) return new NextResponse("indisponível", { status: 404 });

  const quote = await prisma.quote.findFirst({ where: { id: quoteId, clientId: portal.clientId } });
  if (!quote) return new NextResponse("não encontrado", { status: 404 });

  const contact = await prisma.waContact.findUnique({ where: { id: quote.contactId }, select: { displayName: true, name: true, waId: true } });
  const contactName = contact?.displayName || contact?.name || contact?.waId || null;
  const cidade = ((quote.intake as Record<string, unknown> | null)?.cidade_entrega as string | undefined) ?? null;

  const doc = await buildQuoteDocData(portal.clientId, quote.items as unknown as QuoteLineIn[], quote.total, quote.currency, contactName, quote.number, cidade);
  const pdf = await renderQuotePdf(doc);

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
