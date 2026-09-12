import { prisma } from "@/lib/prisma";

// ── Número que parou de receber ──────────────────────────────────────────────
// O pior defeito de um painel de equipe com vários números, e o mais silencioso.
//
// Se o WhatsApp de uma pessoa cai — a regra dos 13 dias da coexistência, que já
// derrubou um cliente nosso —, os leads dela simplesmente param de chegar. E aí
// a tela de Equipe mostra essa pessoa como a MELHOR do time: fila zero, nada
// esperando, nenhum gargalo. Não há o que ser lento quando não chega nada.
//
// A gestora lê "o Felipe está tranquilo" quando o certo seria "o WhatsApp do
// Felipe está fora do ar". Um problema de infraestrutura disfarçado de pessoa
// indo bem — e ninguém vai atrás, porque nada parece errado.
//
// `lastEventAt` sempre existiu na conexão. O que faltava era alguém olhar.

/** Horas de silêncio até desconfiar. Um domingo inteiro não pode disparar. */
const SILENCIO_H = Number(process.env.WA_SILENCIO_HORAS ?? 26);

/**
 * Só desconfia de número que JÁ TRABALHOU. Um número recém-conectado, ainda sem
 * a primeira mensagem, está esperando — não está mudo. Confundir os dois faria
 * todo cliente novo nascer com um alerta vermelho.
 */
const MIN_MENSAGENS = 20;

export interface NumeroMudo {
  connectionId: string;
  nome: string;
  dono: string | null;
  equipe: string | null;
  horasEmSilencio: number;
  ultimaAtividade: Date;
}

export async function numerosMudos(clientId: string, visiveis?: string[] | null): Promise<NumeroMudo[]> {
  const conns = await prisma.waConnection.findMany({
    where: { clientId, ...(visiveis ? { id: { in: visiveis } } : {}) },
    select: { id: true, name: true, displayPhone: true, ownerEmail: true, equipe: true, lastEventAt: true },
  });
  if (conns.length === 0) return [];

  const corte = new Date(Date.now() - SILENCIO_H * 3_600_000);
  const suspeitos = conns.filter((c) => c.lastEventAt && c.lastEventAt < corte);
  if (suspeitos.length === 0) return [];

  // Quantas mensagens cada suspeito já moveu na vida — separa "caiu" de "nunca
  // começou". Uma consulta só para todos.
  const volume = await prisma.waMessage.groupBy({
    by: ["connectionId"],
    where: { connectionId: { in: suspeitos.map((c) => c.id) } },
    _count: { _all: true },
  });
  const porConexao = new Map(volume.map((v) => [v.connectionId, v._count._all]));

  return suspeitos
    .filter((c) => (porConexao.get(c.id) ?? 0) >= MIN_MENSAGENS)
    .map((c) => ({
      connectionId: c.id,
      nome: c.name || c.displayPhone || "Número",
      dono: c.ownerEmail,
      equipe: c.equipe,
      horasEmSilencio: Math.floor((Date.now() - c.lastEventAt!.getTime()) / 3_600_000),
      ultimaAtividade: c.lastEventAt!,
    }))
    .sort((a, b) => b.horasEmSilencio - a.horasEmSilencio);
}
