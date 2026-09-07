import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";
import { isStrongAd } from "@/lib/wa-leads";

export const runtime = "nodejs";

// GET — lista de conversas do cliente (token-scoped). Devolve { conversations, me, attendants }.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId } });
  if (!conn) return NextResponse.json({ conversations: [], me: null, attendants: [], hasMore: false });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const owner = url.searchParams.get("owner"); // "me" → só as conversas da vendedora logada (dona)
  // "arquivadas=1" mostra o que foi tirado da caixa. Sem o parâmetro a resposta
  // é a de sempre — o PWA não manda e continua vendo tudo.
  const arquivadas = url.searchParams.get("arquivadas") === "1";
  const me = portal.email;
  const isAdmin = portal.isAdmin;
  // Filtro "Minhas conversas": o dono da conversa é waConversation.assignedEmail.
  const ownerFilter = owner === "me" && me ? { conversation: { is: { assignedEmail: me } } } : {};
  // Por padrão a caixa esconde as arquivadas. O `is: null` cobre contato que
  // ainda não tem linha de conversa — sem ele, lead novo sumiria da lista.
  const arquivoFilter = arquivadas
    ? { conversation: { is: { portalArchivedAt: { not: null } } } }
    : { OR: [{ conversation: { is: { portalArchivedAt: null } } }, { conversation: { is: null } }] };
  const digits = q.replace(/\D/g, "");
  const search = q
    ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { displayName: { contains: q, mode: "insensitive" as const } },
        ...(digits.length >= 3 ? [{ waId: { contains: digits } }] : []),
      ] }
    : {};

  const rows = await prisma.waContact.findMany({
    where: { connectionId: conn.id, ...search, ...ownerFilter, ...arquivoFilter },
    orderBy: { lastMessageAt: "desc" },
    skip: offset,
    take: limit + 1,
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1, select: { text: true, direction: true, type: true } } },
  });
  const hasMore = rows.length > limit;
  const contacts = hasMore ? rows.slice(0, limit) : rows;
  const ids = contacts.map((c) => c.id);
  const [leads, convs, attendants, contactTags] = await Promise.all([
    prisma.waLead.findMany({ where: { connectionId: conn.id, contactId: { in: ids } }, select: { contactId: true, adTitle: true, adModel: true, adId: true, ctwaClid: true, sourceType: true } }),
    prisma.waConversation.findMany({ where: { contactId: { in: ids } }, select: { contactId: true, funnelStage: true, assignedEmail: true, portalReadAt: true, portalReadBy: true, portalArchivedAt: true, lastInboundAt: true, lastOutboundAt: true } }),
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true } }),
    prisma.waContactTag.findMany({ where: { contactId: { in: ids } }, select: { contactId: true, tag: { select: { id: true, name: true, color: true } } } }),
  ]);
  const leadBy = new Map(leads.map((l) => [l.contactId, l]));
  const convBy = new Map(convs.map((c) => [c.contactId, c]));
  const tagsBy = new Map<string, { id: string; name: string; color: string }[]>();
  for (const ct of contactTags) { const arr = tagsBy.get(ct.contactId) ?? []; arr.push(ct.tag); tagsBy.set(ct.contactId, arr); }
  const nameOf = (email: string | null) => (email ? (attendants.find((a) => a.email === email)?.name || email.split("@")[0]) : null);

  return NextResponse.json({
    me,
    isAdmin,
    hasMore,
    meName: nameOf(me),
    attendants: attendants.map((a) => ({ email: a.email, name: a.name || a.email.split("@")[0] })),
    conversations: contacts.map((c) => {
      const lead = leadBy.get(c.id);
      const last = c.messages[0];
      const cv = convBy.get(c.id);
      return {
        contactId: c.id,
        name: c.displayName || c.name || c.waId,
        waId: c.waId,
        lastText: last?.text ?? null,
        lastType: last?.type ?? null,
        lastDirection: last?.direction ?? null,
        lastMessageAt: c.lastMessageAt,
        fromAd: !!lead,
        adStrong: isStrongAd(lead),
        adTitle: lead?.adTitle ?? null,
        adModel: lead?.adModel ?? null,
        funnelStage: cv?.funnelStage ?? null,
        assignedEmail: cv?.assignedEmail ?? null,
        assignedName: nameOf(cv?.assignedEmail ?? null),
        // Estado compartilhado pela equipe. Campos NOVOS: o PWA ignora.
        // Desde quando o lead espera. O dado já existia na conversa e nunca
        // tinha saído daqui — é o que separa "1.257 esperando" de uma fila
        // que dá para priorizar.
        lastInboundAt: cv?.lastInboundAt ?? null,
        lastOutboundAt: cv?.lastOutboundAt ?? null,
        lida: cv?.portalReadAt != null,
        lidaPor: cv?.portalReadBy ?? null,
        arquivada: cv?.portalArchivedAt != null,
        tags: tagsBy.get(c.id) ?? [],
      };
    }),
  });
}
