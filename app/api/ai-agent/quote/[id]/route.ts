import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { renderQuotePdf } from "@/lib/quote-pdf";

export const runtime = "nodejs";

// GET /api/ai-agent/quote/[id] → baixa o PDF de um orçamento (preview/operador).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });

  const [client, contact] = await Promise.all([
    prisma.client.findUnique({ where: { id: quote.clientId }, select: { name: true } }),
    prisma.waContact.findUnique({ where: { id: quote.contactId }, select: { name: true, displayName: true } }),
  ]);

  const pdf = await renderQuotePdf({
    clientName: client?.name ?? "Orçamento",
    number: quote.number,
    contactName: contact?.displayName ?? contact?.name ?? null,
    items: quote.items as unknown as { label: string; qty: number; unit: number; amount: number }[],
    subtotal: quote.subtotal, fees: quote.fees, total: quote.total, currency: quote.currency,
    summary: quote.summary, generatedAt: quote.createdAt.toLocaleDateString("pt-BR"),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orcamento-${quote.number}.pdf"`,
    },
  });
}
