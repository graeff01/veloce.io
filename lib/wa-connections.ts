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
 *
 * `visiveis` é a SEGUNDA permissão: uma gerente que só acompanha três números
 * não alcança a conversa de um quarto digitando a URL. Sem isto o recorte seria
 * só da tela — ou seja, não seria recorte nenhum.
 */
export async function conexaoDoContato(clientId: string, contactId: string, visiveis?: string[] | null) {
  const contact = await prisma.waContact.findFirst({
    where: {
      id: contactId,
      connection: { clientId, ...(visiveis ? { id: { in: visiveis } } : {}) },
    },
    include: { connection: true },
  });
  if (!contact) return { conn: null, contact: null };
  const { connection, ...rest } = contact;
  return { conn: connection, contact: { ...rest, connectionId: connection.id } };
}

// ── Quais números ESTA pessoa alcança ────────────────────────────────────────
// Segunda dimensão de escopo, depois do cliente. Duas gerentes na mesma conta
// enxergavam a operação inteira — não havia como dizer "estes três números são
// da Michele, estes três da Vitória", que é como o trabalho delas é dividido.
//
// Vale só para quem ACOMPANHA (`gestor`). Quem atende trabalha na caixa inteira
// do cliente, como sempre — dividir a caixa de quem responde seria outra coisa,
// e não é o que se pediu.
//
// REGRA DA VOLTA: gerente sem NENHUM número atribuído vê todos. É o estado de
// quem ainda não configurou, e a alternativa — tela vazia — faria parecer que o
// sistema quebrou justamente no primeiro acesso.

export async function conexoesDoGestor(clientId: string, email: string | null): Promise<string[] | null> {
  if (!email) return null;
  const meus = await prisma.waConnection.findMany({
    where: { clientId, gestorEmail: email },
    select: { id: true },
  });
  return meus.length ? meus.map((c) => c.id) : null; // nenhum designado = vê tudo
}

/**
 * Aplica o recorte da pessoa sobre os números do cliente.
 *
 * `visiveis` nulo = sem recorte (quem atende, ou gerente ainda sem números
 * designados). Nunca devolve mais do que o cliente tem: o recorte só estreita.
 */
export function recortar(doCliente: string[], visiveis: string[] | null): string[] {
  if (!visiveis) return doCliente;
  const permitidos = new Set(visiveis);
  return doCliente.filter((id) => permitidos.has(id));
}

/** Ids do cliente já recortados para esta pessoa. Atalho dos dois acima. */
export async function idsVisiveis(clientId: string, visiveis: string[] | null): Promise<string[]> {
  return recortar(await idsDasConexoes(clientId), visiveis);
}
