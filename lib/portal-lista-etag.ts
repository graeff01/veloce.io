import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// ── Vale a pena montar a lista de novo? ──────────────────────────────────────
// A caixa de conversas é recarregada a cada 6 segundos, e montá-la custa seis
// consultas ao banco mais a serialização. Na esmagadora maioria dessas vezes
// nada mudou desde a anterior.
//
// Esta função responde "mudou alguma coisa?" com TRÊS agregados baratos. Se a
// resposta é não, a rota devolve 304 e o trabalho pesado não acontece — nem no
// servidor nem no aparelho, que também deixa de baixar o JSON inteiro.
//
// O que a impressão cobre:
//   • mensagem nova ou contato novo → contagem/maior lastMessageAt de WaContact
//   • etapa, atribuição, leitura, arquivamento → maior updatedAt de WaConversation
//   • etiqueta posta ou tirada → contagem de WaContactTag
//   • quem está pedindo e o que está filtrando → entram no hash direto
//
// O que ela NÃO cobre, de propósito: renomear uma etiqueta ou um contato. São
// ações que a própria pessoa faz na tela, e a tela recarrega sem condicional
// depois de uma ação — quem mexeu vê o resultado na hora.
export async function impressaoDaLista(
  idsVisiveis: string[],
  identidade: string,
): Promise<string> {
  const [contatos, conversas, etiquetas] = await Promise.all([
    prisma.waContact.aggregate({
      where: { connectionId: { in: idsVisiveis } },
      _count: { _all: true },
      _max: { lastMessageAt: true },
    }),
    prisma.waConversation.aggregate({
      where: { connectionId: { in: idsVisiveis } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.waContactTag.count({ where: { contact: { connectionId: { in: idsVisiveis } } } }),
  ]);

  const cru = [
    identidade,
    contatos._count._all,
    contatos._max.lastMessageAt?.getTime() ?? 0,
    conversas._count._all,
    conversas._max.updatedAt?.getTime() ?? 0,
    etiquetas,
  ].join("|");

  return `W/"${createHash("sha1").update(cru).digest("base64url").slice(0, 22)}"`;
}

// O cabeçalho pode chegar com vários valores (RFC 9110). Basta um bater.
export function etagConfere(cabecalho: string | null, etag: string): boolean {
  if (!cabecalho) return false;
  return cabecalho.split(",").some((v) => v.trim() === etag);
}
