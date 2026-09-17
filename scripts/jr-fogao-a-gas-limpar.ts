/**
 * Ajuste fino da resposta 4 da Maria ("pode se referir como fogão a gás").
 *
 * A troca anterior deixou 'Fogão a gás embutido (no catálogo aparece como
 * "bifeteira")' nos blocos de produto — e a IA repetia o parêntese inteiro para
 * o cliente: "fogão a gás embutido (chamado bifeteira)". Lidera com o termo
 * certo, mas o aposto é ruído numa mensagem de venda.
 *
 * Tira o parêntese SÓ dos blocos de produto. A palavra continua no bloco de
 * desambiguação (para a IA ENTENDER o cliente que disser "bifeteira") e na
 * lista de acessórios, onde "bifeteira 26x26" é outro produto.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const APOSTO = ` (no catálogo aparece como "bifeteira")`;

async function main() {
  for (const bloco of ["Churrasqueira Gourmet", "Churrasqueira Gourmet Supreme"]) {
    const ch = await prismaUnscoped.knowledgeChunk.findFirst({
      where: { clientId: CLIENTE, title: { startsWith: bloco } },
      select: { id: true, title: true, content: true },
    });
    if (!ch) { console.log(`✗ não encontrado: ${bloco}`); continue; }
    const n = ch.content.split(APOSTO).length - 1;
    if (n === 0) { console.log(`· já limpo: ${ch.title}`); continue; }
    const novo = ch.content.split(APOSTO).join("");
    const r = await prismaUnscoped.knowledgeChunk.updateMany({
      where: { id: ch.id, content: ch.content }, data: { content: novo },
    });
    console.log(r.count === 1 ? `✓ ${ch.title} (−${n} aposto)` : `✗ não gravado: ${ch.title}`);
  }

  // A IA ainda precisa ENTENDER quem disser "bifeteira": confere que o mapa ficou.
  const desamb = await prismaUnscoped.knowledgeChunk.findFirst({
    where: { clientId: CLIENTE, title: { contains: "Lado aberto" } }, select: { content: true },
  });
  console.log(`\nbloco de desambiguação ainda mapeia "bifeteira":`, /bifeteira/i.test(desamb?.content ?? ""));
  const acess = await prismaUnscoped.knowledgeChunk.findFirst({
    where: { clientId: CLIENTE, title: { startsWith: "Churrasqueira Tradição Gourmet" } }, select: { content: true },
  });
  console.log(`acessório "bifeteira 26x26" intacto:`, /bifeteira 26x26/i.test(acess?.content ?? ""));
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
