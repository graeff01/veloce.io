import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";
import { sendQuotePdf } from "@/lib/ai-agent/quote-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — Vendedor APROVA o orçamento em revisão → o PDF é enviado ao lead na hora.
// Body opcional { desconto } aplica um desconto de fechamento antes do envio.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; quoteId: string }> }) {
  const { token, quoteId } = await params;
  // Passa pelo GATE do portal, como as demais rotas. Antes decidia a
  // autorização por conta própria e, por isso, ficava de fora da checagem de
  // seção: um usuário restrito a "conversas" lia e aprovava orçamento.
  const { error, portal } = await guardPortal(req, token, { section: "revisao" });
  if (error) return error;
  const me = portal.email;
  if (!me) return NextResponse.json({ error: "Faça login para aprovar." }, { status: 401 });

  // Trava ATÔMICA: só um vendedor aprova (evita envio duplicado). Marca o dono da revisão
  // mantendo o status "pending_review" — o sendQuotePdf é quem carimba "sent" ao enviar.
  const locked = await prisma.quote.updateMany({
    where: { id: quoteId, clientId: portal.clientId, status: "pending_review", reviewedByEmail: null },
    data: { reviewedByEmail: me },
  });
  if (locked.count === 0) return NextResponse.json({ error: "Este orçamento já está sendo revisado por outra pessoa." }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const desconto = Math.max(0, Number(body?.desconto) || 0);

  const sent = await sendQuotePdf({ quoteId, clientId: portal.clientId, discount: desconto, reviewerEmail: me });
  if (!sent.ok) {
    // Libera a trava: o PDF não saiu, outro vendedor (ou este) pode tentar de novo.
    await prisma.quote.update({ where: { id: quoteId }, data: { reviewedByEmail: null } }).catch(() => {});
    return NextResponse.json({ error: sent.error || "Falha ao enviar o PDF." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, number: sent.number, total: sent.total });
}
