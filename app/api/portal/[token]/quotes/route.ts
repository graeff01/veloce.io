import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";

// GET — registro dos orçamentos ENVIADOS ao cliente (token-scoped). Só quando o
// cliente tem orçamento habilitado (quotesEnabled) — caso contrário devolve vazio.
// O PDF em si não é armazenado: cada linha aponta pra rota que o regenera sob demanda.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token);
  if (error) return error;

  const ai = await prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { quotesEnabled: true } });
  if (!ai?.quotesEnabled) return NextResponse.json({ quotes: [] });

  // Só os que saíram como PDF pro lead (rascunho não conta no registro).
  const quotes = await prisma.quote.findMany({
    where: { clientId: portal.clientId, status: { in: ["sent", "approved", "rejected"] } },
    orderBy: { number: "desc" },
    take: 500,
    select: { id: true, number: true, total: true, currency: true, status: true, summary: true, contactId: true, createdAt: true, updatedAt: true },
  });

  const contactIds = [...new Set(quotes.map((q) => q.contactId))];
  const contacts = await prisma.waContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, displayName: true, name: true, waId: true } });
  const nameOf = new Map(contacts.map((c) => [c.id, c.displayName || c.name || c.waId]));

  return NextResponse.json({
    quotes: quotes.map((q) => ({
      id: q.id,
      // O app abre a conversa a partir daqui — sem o contato, a lista de
      // enviados é um beco sem saída.
      contactId: q.contactId,
      number: q.number,
      total: q.total,
      currency: q.currency,
      status: q.status,
      summary: q.summary,
      contactName: nameOf.get(q.contactId) ?? null,
      sentAt: q.updatedAt,
      createdAt: q.createdAt,
    })),
  });
}
