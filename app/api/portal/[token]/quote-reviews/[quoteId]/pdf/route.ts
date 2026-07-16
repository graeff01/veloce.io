import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { renderQuotePdf } from "@/lib/quote-pdf";
import { buildQuoteDocData, type QuoteLineIn } from "@/lib/ai-agent/tools";
import type { IntakeData } from "@/lib/ai-agent/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — Preview do PDF do orçamento em revisão (o vendedor vê EXATAMENTE o que chegaria
// ao lead). `?desconto=` mostra o efeito de um desconto de fechamento antes de aprovar.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, clientId: portal.clientId } });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const contact = await prisma.waContact.findUnique({ where: { id: quote.contactId }, select: { name: true, displayName: true } });
  const ficha = quote.intake as IntakeData | null;
  const fichaNome = typeof ficha?.nome === "string" && ficha.nome.trim() ? ficha.nome.trim() : null;
  const fichaCidade = typeof ficha?.cidade_entrega === "string" ? ficha.cidade_entrega : null;
  const contactName = fichaNome ?? contact?.displayName ?? contact?.name ?? null;

  const desconto = Math.max(0, Number(new URL(req.url).searchParams.get("desconto")) || 0);
  const base = quote.items as unknown as QuoteLineIn[];
  const linhas: QuoteLineIn[] = desconto > 0 ? [...base, { code: null, label: "Desconto", qty: 1, unit: -desconto, amount: -desconto }] : base;
  const total = Math.max(0, quote.total - desconto);

  try {
    const pdf = await renderQuotePdf(await buildQuoteDocData(portal.clientId, linhas, total, quote.currency, contactName, quote.number, fichaCidade));
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="orcamento-${quote.number}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 120) }, { status: 500 });
  }
}
