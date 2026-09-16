/**
 * Atualiza o bloco de vocabulário com o que a Maria confirmou por áudio:
 *  • lado aberto: Gourmet, Tradição Gourmet E as Parrillas
 *  • dá para ESPELHAR o lado — abertura à direita ou à esquerda
 *  • Tradição (sem "Gourmet"): fogão a lenha embutido, mas FECHADA dos dois lados
 *
 * Lê, mostra o antes/depois e grava ancorado no conteúdo lido.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { embed } from "@/lib/openai";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const TITULO = "Lado aberto, em balanço, fogão embutido, bifeteira, fogão a gás — a qual modelo o cliente se refere";

async function main() {
  const bloco = await prismaUnscoped.knowledgeChunk.findFirst({
    where: { clientId: CLIENTE, title: TITULO }, select: { id: true, content: true },
  });
  if (!bloco) { console.error("bloco não encontrado"); process.exit(1); }
  if (bloco.content.includes("espelhar")) { console.log("já atualizado"); process.exit(0); }

  const ADENDO = `

LADO ABERTO — a lista COMPLETA (confirmado pela JR): têm lado aberto a GOURMET, a TRADIÇÃO GOURMET e as PARRILLAS (Parrilla 81 e Parrilla 105). A TRADIÇÃO (sem "Gourmet") tem fogão a lenha embutido, mas é FECHADA DOS DOIS LADOS — não tem lado aberto.

ESPELHAR O LADO: a abertura PODE ser espelhada — para a DIREITA ou para a ESQUERDA, conforme o cliente precisar. Se ele pedir "espelhado", "invertido", "para o outro lado", "abertura na esquerda/direita", a resposta é SIM, dá para fazer. Registre o lado escolhido na ficha e siga normalmente.`;

  const novo = bloco.content.trimEnd() + ADENDO;
  const [vetor] = await embed([`${TITULO}\n${novo}`]);

  const r = await prismaUnscoped.knowledgeChunk.updateMany({
    where: { id: bloco.id, content: bloco.content },
    data: { content: novo, embedding: vetor },
  });
  console.log(r.count === 1
    ? `gravado: ${bloco.content.length} -> ${novo.length} caracteres`
    : "NÃO gravado — o bloco mudou desde a leitura");
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
