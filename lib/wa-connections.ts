import { prisma } from "@/lib/prisma";

// ── Os números de WhatsApp de um cliente ─────────────────────────────────────
// Durante muito tempo "a conexão do cliente" foi uma coisa só — havia um índice
// único em `WaConnection.clientId` garantindo isso. Não é mais verdade: a Jardim
// do Lago atende por seis números, três da consultoria e três da captação.
//
// O perigo é silencioso. Todo lugar que faz `findFirst({ where: { clientId } })`
// continua compilando, continua respondendo 200 e simplesmente mostra a operação
// de UM número como se fosse a do cliente inteiro — um painel que erra por cinco
// sextos sem nunca acusar erro.
//
// Este módulo existe para que essa decisão viva num lugar só.

/** Ids de todos os números do cliente, na ordem em que foram conectados. */
export async function idsDasConexoes(clientId: string): Promise<string[]> {
  const conns = await prisma.waConnection.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return conns.map((c) => c.id);
}

/**
 * Filtro de `connectionId` para as consultas.
 *
 * Com um número só devolve a igualdade simples — é o que os índices compostos
 * (`@@index([connectionId, ...])`) usam melhor, e mantém o plano de execução dos
 * clientes de hoje exatamente como era.
 */
export function filtroConexoes(ids: string[]): string | { in: string[] } {
  return ids.length === 1 ? ids[0]! : { in: ids };
}

/**
 * A conexão a que um contato pertence, conferindo que ela é DESTE cliente.
 *
 * Rotas de um contato específico (abrir conversa, baixar mídia, resumir) não
 * podem mais assumir "a" conexão do cliente: o contato pode estar em qualquer
 * um dos números. Quem manda é o contato; o cliente é a permissão.
 */
export async function conexaoDoContato(clientId: string, contactId: string) {
  const contact = await prisma.waContact.findFirst({
    where: { id: contactId, connection: { clientId } },
    include: { connection: true },
  });
  if (!contact) return { conn: null, contact: null };
  const { connection, ...rest } = contact;
  return { conn: connection, contact: { ...rest, connectionId: connection.id } };
}
