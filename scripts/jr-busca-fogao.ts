/**
 * A IA errou "Parrilla tem fogão" e mandou foto da Tradição. O bloco que responde
 * isso EXISTE e é preciso: "Lado aberto, em balanço, fogão embutido..." — diz que
 * só TRADIÇÃO GOURMET (lenha) e GOURMET (bifeteira a gás) têm fogão embutido.
 *
 * Pergunta: a busca traz esse bloco quando o cliente fala em fogão? Se não traz,
 * o erro se repete no próximo cliente — e a Maria vai estar olhando.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { retrieveKnowledge } from "@/lib/ai-agent/retrieval";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const ALVO = "Lado aberto";

const PERGUNTAS = [
  "Quais as churrasqueira com fogão que tu tem?",
  "Me mande foto dos modelos que tem fogão",
  "quero uma churrasqueira com fogão",
  "churrasqueira com fogão a lenha",
  "tem churrasqueira com fogão embutido?",
  "o modelo com fogão a gás",
  "churrasqueira com fogão campeiro",
  "qual churrasqueira vem com fogão junto",
];

async function main() {
  // Mede com o POOL real (8) e o MMR ligado — que é o que roda em produção.
  // A medição por ranking puro engana: lá o bloco fica sempre entre 1º e 4º, mas
  // o MMR (LAMBDA=0.7) o descarta por "parecer redundante" com o bloco do produto,
  // justamente quando ele é o que CORRIGE o bloco do produto.
  for (const final of [3, 4, 5]) {
    let achou = 0;
    const perdidas: string[] = [];
    for (const q of PERGUNTAS) {
      const r = await retrieveKnowledge(CLIENTE, q, { final });
      if (r.used.some((u) => (u.title ?? "").includes(ALVO))) achou++;
      else perdidas.push(q);
    }
    console.log(`FINAL=${final} (pool padrão, MMR ligado) → ${achou}/${PERGUNTAS.length}`);
    for (const q of perdidas) console.log(`     ainda perde: "${q}"`);
  }

  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
