import { prisma } from "@/lib/prisma";

// ── Saúde do token de um número ──────────────────────────────────────────────
// A falha mais silenciosa do módulo: quando o token de um número expira ou é
// revogado, as mensagens CONTINUAM chegando — o webhook não usa o nosso token.
// Então `lastEventAt` segue atualizando, o detector de "número mudo" diz que
// está tudo bem, e o que quebra é o resto: a mídia para de carregar e a IA para
// de responder.
//
// O número parece vivo e está quebrado. Com os funcionários respondendo pelo
// próprio celular, ninguém percebe até alguém reclamar que a foto não abre.
//
// A ideia aqui é simples: quem já fala com a Meta é quem sabe. Toda chamada de
// envio ou de mídia passa a reportar o desfecho, e o estado fica no número.

/** Erros da Graph que significam "esta credencial não vale mais". */
const AUTENTICACAO = new Set([190, 200, 10, 2500]);

export function ehFalhaDeAutenticacao(codigo: unknown): boolean {
  return typeof codigo === "number" && AUTENTICACAO.has(codigo);
}

/** Frase curta e acionável, para caber num alerta. */
function explicar(codigo: number, mensagem: string): string {
  if (codigo === 190) return "Token expirado ou revogado";
  if (codigo === 200 || codigo === 10) return "Token sem permissão sobre este número";
  return mensagem.slice(0, 140) || `Erro ${codigo}`;
}

/**
 * Registra o desfecho de uma chamada à Meta para este número.
 *
 * Best-effort de propósito: marcar saúde NUNCA pode derrubar um envio que deu
 * certo, nem transformar uma falha de rede em exceção no meio do atendimento.
 *
 * Identifica pelo `phoneNumberId` porque é o que as funções de envio já têm em
 * mãos — enfiar o id da conexão em cada assinatura seria mexer em dez lugares
 * para não ganhar nada.
 */
export function registrarDesfecho(
  phoneNumberId: string,
  desfecho: { ok: true } | { ok: false; codigo: unknown; mensagem: string },
): void {
  if (desfecho.ok) {
    // Só escreve se ESTAVA marcado. Na esmagadora maioria das vezes casa zero
    // linhas — é uma consulta indexada barata, não um UPDATE por mensagem.
    void prisma.waConnection.updateMany({
      where: { phoneNumberId, tokenFalhouEm: { not: null } },
      data: { tokenFalhouEm: null, tokenErro: null },
    }).catch(() => {});
    return;
  }

  // Só autenticação. Recusa de conteúdo, janela de 24h fechada ou limite de
  // taxa não são problema de credencial, e marcar tudo faria o alerta virar
  // ruído — que é como um alerta deixa de ser lido.
  if (!ehFalhaDeAutenticacao(desfecho.codigo)) return;

  void prisma.waConnection.updateMany({
    // `tokenFalhouEm: null` mantém a PRIMEIRA vez que falhou, que é o que diz
    // há quanto tempo o número está quebrado.
    where: { phoneNumberId, tokenFalhouEm: null },
    data: {
      tokenFalhouEm: new Date(),
      tokenErro: explicar(desfecho.codigo as number, desfecho.mensagem),
    },
  }).catch(() => {});
}

export interface NumeroSemToken {
  connectionId: string;
  nome: string;
  dono: string | null;
  erro: string;
  desde: Date;
  horas: number;
}

/** Números cujo token a Meta está recusando. */
export async function numerosComTokenQuebrado(
  clientId: string,
  visiveis?: string[] | null,
): Promise<NumeroSemToken[]> {
  const conns = await prisma.waConnection.findMany({
    where: {
      clientId,
      tokenFalhouEm: { not: null },
      ...(visiveis ? { id: { in: visiveis } } : {}),
    },
    select: { id: true, name: true, displayPhone: true, ownerEmail: true, tokenFalhouEm: true, tokenErro: true },
  });

  return conns.map((c) => ({
    connectionId: c.id,
    nome: c.name || c.displayPhone || "Número",
    dono: c.ownerEmail,
    erro: c.tokenErro ?? "A Meta recusou o token",
    desde: c.tokenFalhouEm!,
    horas: Math.floor((Date.now() - c.tokenFalhouEm!.getTime()) / 3_600_000),
  }));
}
