import { prisma } from "@/lib/prisma";
import { sendPushToPortalClient } from "./web-push";
import { sendPushToPortalDevices } from "./device-push";
import { gateOnce } from "./dispatch";
import { calcularInsightsEquipe, type Gargalo } from "@/lib/portal/equipe-insights";
import { conexoesDoGestor } from "@/lib/wa-connections";

// ── Avisar quem acompanha ────────────────────────────────────────────────────
// A tela de Equipe diagnostica bem e não serve para nada se ninguém abrir. Uma
// gestora não fica o dia no painel: ela atende, reúne, viaja. Um lead pode
// passar três dias sem resposta e ela só descobre por acaso — que é exatamente
// o problema que a tela existe para resolver.
//
// Os avisos usam AS MESMAS regras da tela (`calcularInsightsEquipe`). Se o
// alerta dissesse uma coisa e a tela outra, ela deixaria de confiar nas duas.
//
// ── O que NÃO fazemos aqui ───────────────────────────────────────────────────
// Avisar de tudo. Um painel que apita o dia inteiro é desligado na primeira
// semana, e aí ele não avisa nem do que importa. Três travas:
//
//   1. só gravidade ALTA — lead sem resposta nenhuma, espera passando de um
//      dia, número fora do ar. O resto ela vê quando abrir;
//   2. UM aviso por dia por assunto, por pessoa (`gateOnce` com a data na
//      chave): o mesmo problema não cutuca de hora em hora;
//   3. no máximo dois por rodada — três alertas juntos já não são lidos.

const MAX_POR_RODADA = 2;

/** Só o que justifica interromper alguém. */
const URGENTES = new Set<Gargalo["tipo"]>(["numero_mudo", "sem_resposta", "espera_longa"]);

function chaveDoDia(clientId: string, g: Gargalo): string {
  const dia = new Date().toISOString().slice(0, 10);
  return `gestor:${clientId}:${g.tipo}:${g.pessoa ?? "-"}:${dia}`;
}

/**
 * Avisa as gestoras de UM cliente. Devolve quantos avisos saíram.
 *
 * Cliente sem ninguém no papel de acompanhamento não custa nada: sai antes de
 * calcular qualquer coisa.
 */
export async function alertarGestores(clientId: string): Promise<number> {
  const gestores = await prisma.portalAccess.findMany({
    where: { clientId, role: "gestor" },
    select: { email: true },
  });
  if (gestores.length === 0) return 0;

  const portal = await prisma.clientPortal.findUnique({
    where: { clientId }, select: { token: true, active: true },
  });
  if (!portal?.active) return 0;

  let enviados = 0;
  // Um cálculo POR GERENTE, não um para o cliente: cada uma acompanha os seus
  // números, e avisá-la de um problema que não é dela é ruído — e, pior, expõe
  // a operação da outra.
  for (const { email } of gestores) {
    const { gargalos } = await calcularInsightsEquipe(
      clientId, "week", await conexoesDoGestor(clientId, email),
    );
    const urgentes = gargalos.filter((g) => g.gravidade === "alta" && URGENTES.has(g.tipo));

    for (const g of urgentes.slice(0, MAX_POR_RODADA)) {
      // A chave carrega o e-mail: o mesmo problema avisa cada gerente uma vez.
      if (!(await gateOnce(`${chaveDoDia(clientId, g)}:${email}`))) continue;

      const payload = { title: g.titulo, body: g.detalhe, url: `/r/${portal.token}/equipe` };
      // Os dois canais: navegador (PWA) e aparelho (app). Cada um sai sozinho —
      // um indisponível não pode levar o outro junto.
      await sendPushToPortalClient(clientId, payload, { onlyEmail: email }).catch(() => 0);
      await sendPushToPortalDevices(clientId, {
        title: g.titulo, body: g.detalhe, route: "equipe", collapseId: `gestor:${g.tipo}`,
      }, { onlyEmail: email }).catch(() => 0);
      enviados++;
    }
  }
  return enviados;
}

/**
 * Roda para TODOS os clientes que têm alguém acompanhando.
 *
 * Uma consulta descobre quem são — não vale varrer a base inteira para
 * descobrir que dois clientes usam o recurso.
 */
export async function runAlertasGestor(): Promise<{ clientes: number; avisos: number }> {
  const comGestor = await prisma.portalAccess.findMany({
    where: { role: "gestor" },
    select: { clientId: true },
    distinct: ["clientId"],
  });

  let avisos = 0;
  for (const { clientId } of comGestor) {
    avisos += await alertarGestores(clientId).catch(() => 0);
  }
  return { clientes: comGestor.length, avisos };
}
