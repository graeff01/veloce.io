import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClientAccess } from "@/lib/api-helpers";
import { deriveBadge, monthStart } from "@/lib/wa-leads";

// GET — lista de conversas (contatos) com a última mensagem e marca de anúncio.
// Paginação (offset/limit) + BUSCA NO SERVIDOR (nome/apelido/número) — encontra qualquer
// conversa, de qualquer data, sem depender do que já foi carregado. Retorna { items, hasMore }.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireClientAccess(id);
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const digits = q.replace(/\D/g, "");
  const search = q
    ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { displayName: { contains: q, mode: "insensitive" as const } },
        ...(digits.length >= 3 ? [{ waId: { contains: digits } }] : []),
      ] }
    : {};

  // take+1 para saber se há próxima página sem um count extra.
  const rows = await prisma.waContact.findMany({
    where: { connectionId: conn.id, ...search },
    orderBy: { lastMessageAt: "desc" },
    skip: offset,
    take: limit + 1,
    include: {
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
      tags: { include: { tag: true } },
    },
  });
  const hasMore = rows.length > limit;
  const contacts = hasMore ? rows.slice(0, limit) : rows;

  const leads = await prisma.waLead.findMany({
    where: { connectionId: conn.id, contactId: { in: contacts.map((c) => c.id) } },
  });
  const leadByContact = new Map(leads.map((l) => [l.contactId, l]));
  const period = monthStart();

  return NextResponse.json({
    hasMore,
    items: contacts.map((c) => {
      const lead = leadByContact.get(c.id);
      const last = c.messages[0];
      return {
        contactId: c.id,
        waId: c.waId,
        name: c.name,
        displayName: c.displayName,
        lastMessageAt: c.lastMessageAt,
        lastText: last?.text ?? null,
        lastDirection: last?.direction ?? null,
        fromAd: !!lead,
        adTitle: lead?.adTitle ?? null,
        reportValid: c.reportValid,
        tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
        // Novo/Recorrente (reativado fica na visão mensal de Leads de anúncio).
        badge: deriveBadge({ createdAt: c.createdAt, periodStart: period }),
      };
    }),
  });
}
