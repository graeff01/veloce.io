import { prisma } from "@/lib/prisma";
import { renderQuotePdf } from "@/lib/quote-pdf";
import { sendWhatsAppDocument } from "@/lib/whatsapp-send";
import { buildQuoteDocData, type QuoteLineIn } from "./tools";
import type { IntakeData } from "./intake";

// Envia o PDF do orçamento ao lead pelo WhatsApp. Fonte ÚNICA usada tanto pelo envio
// automático (enviar_orcamento, sem modo revisão) quanto pela aprovação do vendedor na
// fila de revisão. Aplica um desconto de fechamento opcional (linha "Desconto") e grava
// status/rastreabilidade + a mensagem na thread.
export async function sendQuotePdf(opts: {
  quoteId: string;
  clientId: string;
  discount?: number;          // desconto de fechamento (R$) aplicado pelo vendedor
  reviewerEmail?: string;     // vendedor que aprovou (modo revisão)
  contactNameOverride?: string | null; // nome do contato (quando não vem da ficha)
}): Promise<{ ok: boolean; number?: number; total?: number; error?: string }> {
  const quote = await prisma.quote.findFirst({ where: { id: opts.quoteId, clientId: opts.clientId } });
  if (!quote) return { ok: false, error: "Orçamento não encontrado." };
  if (quote.status === "sent" || quote.status === "approved") return { ok: false, error: "Este orçamento já foi enviado." };

  const conn = await prisma.waConnection.findFirst({ where: { clientId: opts.clientId }, select: { phoneNumberId: true, accessToken: true } });
  const contact = await prisma.waContact.findUnique({ where: { id: quote.contactId }, select: { waId: true, name: true, displayName: true } });
  if (!conn || !contact) return { ok: false, error: "Conexão de WhatsApp ou contato indisponível." };

  const ficha = quote.intake as IntakeData | null;
  const fichaNome = typeof ficha?.nome === "string" && ficha.nome.trim() ? ficha.nome.trim() : null;
  const fichaCidade = typeof ficha?.cidade_entrega === "string" ? ficha.cidade_entrega : null;
  const contactName = fichaNome ?? opts.contactNameOverride ?? contact.displayName ?? contact.name ?? null;

  // Desconto de fechamento → vira uma linha negativa e reduz o total.
  const desconto = Math.max(0, Math.round((opts.discount ?? 0) * 100) / 100);
  const items = quote.items as unknown as QuoteLineIn[];
  const linhas: QuoteLineIn[] = desconto > 0
    ? [...items, { code: null, label: "Desconto", qty: 1, unit: -desconto, amount: -desconto }]
    : items;
  const total = Math.max(0, quote.total - desconto);

  try {
    const pdf = await renderQuotePdf(await buildQuoteDocData(opts.clientId, linhas, total, quote.currency, contactName, quote.number, fichaCidade));
    const sent = await sendWhatsAppDocument(conn, contact.waId, { buffer: pdf, filename: `orcamento-${quote.number}.pdf`, caption: `Orçamento Nº ${quote.number}` });
    if (!sent.ok) return { ok: false, error: sent.error ?? "Falha no envio do PDF." };

    await prisma.quote.update({ where: { id: quote.id }, data: {
      status: "sent",
      ...(desconto > 0 ? { discount: desconto, total } : {}),
      ...(opts.reviewerEmail ? { reviewedByEmail: opts.reviewerEmail, reviewedAt: new Date() } : {}),
    } });
    await prisma.waMessage.create({ data: {
      connectionId: (await prisma.waContact.findUnique({ where: { id: quote.contactId }, select: { connectionId: true } }))!.connectionId,
      contactId: quote.contactId, waMessageId: sent.waMessageId || `ia-doc-${Date.now()}`,
      direction: "out", type: "document", text: `[orçamento Nº ${quote.number}]`, aiGenerated: true, timestamp: new Date(),
    } }).catch(() => {});
    return { ok: true, number: quote.number, total };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 120) };
  }
}
