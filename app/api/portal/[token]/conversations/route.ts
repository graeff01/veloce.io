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

  const conns = await prisma.waConnection.findMany({
    where: { clientId: portal.clientId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, displayPhone: true, equipe: true, ownerEmail: true },
  });
  if (conns.length === 0) return NextResponse.json({ conversations: [], me: null, attendants: [], hasMore: false });
  const connIds = conns.map((c) => c.id);
  // De qual número veio cada conversa — é o que permite dizer "esta é da Vitória"
  // sem depender de alguém ter atribuído a conversa na mão.
  const connBy = new Map(conns.map((c) => [c.id, c]));

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const owner = url.searchParams.get("owner"); // "me" → só as conversas da vendedora logada (dona)
  // Filtro por NÚMERO. Só faz sentido com mais de um; o parâmetro é ignorado se
  // apontar para um número que não é deste cliente.
  const conexao = url.searchParams.get("conexao");
  const idsVisiveis = conexao && connIds.includes(conexao) ? [conexao] : connIds;

  // ── Filtros que a tela de Equipe usa para levar ao caso concreto ──────────
  // "12 leads nunca responderam" era um número sem saída: a gestora via o
  // problema e não tinha como chegar nas conversas. Estes dois parâmetros são
  // o caminho de volta do diagnóstico para o atendimento.
  const estado = url.searchParams.get("estado"); // sem-resposta | aguardando
  const dono = url.searchParams.get("dono");     // e-mail de quem atende

  // DONO = a mesma regra das métricas: atribuição manual quando existe, senão
  // quem atende naquele número. Uma regra diferente aqui faria a lista
  // discordar do número que levou a pessoa até ela.
  const numerosDaPessoa = dono ? conns.filter((c) => c.ownerEmail === dono).map((c) => c.id) : [];
  const donoFilter = dono
    ? { OR: [
        { conversation: { is: { assignedEmail: dono } } },
        ...(numerosDaPessoa.length
          ? [{ connectionId: { in: numerosDaPessoa }, conversation: { is: { assignedEmail: null } } }]
          : []),
      ] }
    : {};

  // AGUARDANDO = a última mensagem é do lead. Isso compara duas colunas, o que
  // o Prisma não expressa — daí o SQL cru.
  //
  // E NÃO dá para usar `status: "waiting"`: o fechamento por inatividade troca
  // esse rótulo por "closed" depois de 24h, então o filtro perderia exatamente
  // os leads que esperam há mais tempo — os que mais importam aqui.
  let idsAguardando: string[] | null = null;
  if (estado === "aguardando") {
    const linhas = await prisma.$queryRaw<{ contactId: string }[]>`
      SELECT c."contactId" FROM "WaConversation" c
      WHERE c."connectionId" = ANY(${idsVisiveis}::text[])
        AND c."lastInboundAt" IS NOT NULL
        AND (c."lastOutboundAt" IS NULL OR c."lastInboundAt" > c."lastOutboundAt")
      ORDER BY c."lastInboundAt" ASC
      LIMIT 2000`.catch(() => [] as { contactId: string }[]);
    idsAguardando = linhas.map((l) => l.contactId);
  }

  const estadoFilter =
    estado === "sem-resposta"
      // Nunca respondida: o lead falou e não saiu NADA. Não é demora, é ausência.
      ? { conversation: { is: { lastOutboundAt: null, lastInboundAt: { not: null } } } }
      : idsAguardando
        ? { id: { in: idsAguardando } }
        : {};
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
    where: { connectionId: { in: idsVisiveis }, ...search, ...ownerFilter, ...arquivoFilter, ...donoFilter, ...estadoFilter },
    orderBy: { lastMessageAt: "desc" },
    skip: offset,
    take: limit + 1,
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1, select: { text: true, direction: true, type: true } } },
  });
  const hasMore = rows.length > limit;
  const contacts = hasMore ? rows.slice(0, limit) : rows;
  const ids = contacts.map((c) => c.id);
  const [leads, convs, attendants, contactTags] = await Promise.all([
    prisma.waLead.findMany({ where: { connectionId: { in: connIds }, contactId: { in: ids } }, select: { contactId: true, adTitle: true, adModel: true, adId: true, ctwaClid: true, sourceType: true } }),
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
    // Quem só acompanha não recebe botão que o servidor vai recusar: oferecer o
    // que vai dar erro faz a pessoa levar a culpa por um problema do produto.
    somenteLeitura: portal.somenteLeitura,
    hasMore,
    meName: nameOf(me),
    attendants: attendants.map((a) => ({ email: a.email, name: a.name || a.email.split("@")[0] })),
    // Os números do cliente, para a caixa oferecer o filtro. Vem do servidor e
    // não das conversas carregadas: um número sem conversa nesta página ainda é
    // um número do cliente, e sumir dele seria mentir sobre a operação.
    conexoes: conns.map((c) => ({
      id: c.id, nome: c.name || c.displayPhone || "Número", equipe: c.equipe,
    })),
    conversations: contacts.map((c) => {
      const lead = leadBy.get(c.id);
      const last = c.messages[0];
      const cv = convBy.get(c.id);
      return {
        contactId: c.id,
        name: c.displayName || c.name || c.waId,
        waId: c.waId,
        conexaoId: c.connectionId,
        conexaoNome: connBy.get(c.connectionId)?.name ?? connBy.get(c.connectionId)?.displayPhone ?? null,
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
