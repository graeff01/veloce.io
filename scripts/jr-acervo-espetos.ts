/**
 * Capacidade de espetos por modelo — informado pela Maria em 25/09/2026.
 *
 * Só a Linha Popular tinha capacidade no acervo (4 espetos). Tradição, Tradição
 * Gourmet, Gourmet e as Parrillas não tinham NADA: o cliente perguntava "quantos
 * espetos cabem?" e a IA não tinha o dado — que é o buraco por onde saiu o
 * "Popular com 7 espetos" que a Maria pegou.
 *
 * ⚠️ CUIDADO COM O GUARDA DE CAPACIDADE (lib/ai-agent/capacidade-produto.ts).
 * Ele monta a tabela oficial a partir de "CAPACIDADE: N", "comporta N", "cabem N"
 * e "suporta N", e ABSTÉM quando a resposta atribui outro número ao produto.
 *
 * Gourmet e Tradição Gourmet têm DUAS leituras, ambas corretas: 15 espetos no
 * total (3 níveis × 5) ou 10 espetos + a grelha que acompanha. Se qualquer uma
 * virasse "o número oficial", a outra passaria a ser barrada como erro — e a IA
 * se calaria dizendo a verdade. Por isso esses dois são escritos com "leva até",
 * que de propósito NÃO casa os gatilhos do guarda.
 *
 * Tradição (10) e Popular (4) têm número único: entram como oficiais e ganham a
 * proteção. Parrilla não tem espetos, e "não comporta espetos" não traz número,
 * então também não entra na tabela.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// O guard fica DENTRO da execução: no topo, ele disparava ao só IMPORTAR o CHUNK
// para testar a tabela do guarda — e o teste morria antes de rodar.
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const key = process.env.OPENAI_API_KEY;
const commit = process.argv.includes("--commit");

export const CHUNK = {
  title: "Quantos espetos cabem em cada churrasqueira",
  content:
    "QUANTOS ESPETOS CABEM (o cliente pergunta 'quantos espetos?', 'cabe quantos espetos?', 'quantas pessoas atende?'):\n" +
    "- LINHA PRIME: o número está no nome — 7, 9, 11, 16 ou 32 espetos.\n" +
    "- CHURRASQUEIRA TRADIÇÃO: comporta 10 espetos.\n" +
    "- CHURRASQUEIRA GOURMET e TRADIÇÃO GOURMET: o suporte de fundo para espetos suspensos tem TRÊS NÍVEIS e leva cerca de cinco espetos por nível — ou seja, leva até 15 espetos no total, ou 10 espetos mais a grelha que já acompanha. Explique as duas formas ao cliente: depende de ele querer usar a grelha junto ou só espetos.\n" +
    "- LINHA POPULAR: comporta 4 espetos (e não aceita lenha, só carvão).\n" +
    "- PARRILLA 81x60 e PARRILLA 105x60: NÃO comportam espetos. Esse modelo é só de GRELHA (parrilla). Se o cliente quer espetos, ofereça a Linha Prime, a Tradição ou a Gourmet — nunca diga um número de espetos para a Parrilla.",
};

/**
 * O guarda de capacidade monta a tabela usando o TÍTULO do bloco como dono. O
 * chunk-lista acima é ótimo para o RAG achar, mas nele todos os produtos ficam
 * sob o mesmo título — então ele NÃO protege ninguém. Verificado antes de gravar:
 * com só o chunk-lista, "A Tradição comporta 7 espetos" passava batido.
 *
 * Por isso a capacidade também é ANEXADA ao chunk de cada produto. Onde o número
 * é único (Tradição: 10), usa "comporta N" e o produto ganha proteção. Onde há
 * duas leituras corretas (Gourmet e Tradição Gourmet: 15 no total OU 10 + grelha),
 * usa "leva até", que de propósito não vira número oficial — senão a IA seria
 * barrada dizendo a verdade.
 */
export const ANEXOS: { titulo: string; texto: string }[] = [
  { titulo: "Churrasqueira Tradição",
    texto: "CAPACIDADE: comporta 10 espetos." },
  { titulo: "Churrasqueira Gourmet",
    texto: "ESPETOS: o suporte de fundo tem três níveis e leva cerca de cinco espetos por nível — leva até 15 espetos no total, ou 10 espetos mais a grelha que já acompanha." },
  { titulo: "Churrasqueira Tradição Gourmet",
    texto: "ESPETOS: o suporte de fundo tem três níveis e leva cerca de cinco espetos por nível — leva até 15 espetos no total, ou 10 espetos mais a grelha que já acompanha." },
  { titulo: "Prime Parrilla",
    texto: "ESPETOS: a Parrilla NÃO comporta espetos — é só grelha (parrilla). Se o cliente quer espetos, ofereça a Linha Prime, a Tradição ou a Gourmet." },
];

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}`);
  return (await res.json()).data[0].embedding;
}

const principal = async () => {
  if (!url || !key) { console.error("faltou DATABASE_URL ou OPENAI_API_KEY"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error("cliente não encontrado"); process.exit(1); }
  const existente = await prisma.knowledgeChunk.findFirst({ where: { clientId: c.id, title: CHUNK.title }, select: { id: true } });
  console.log(`\n${c.name} — ${existente ? "atualiza" : "cria"}: ${CHUNK.title}${commit ? "" : "   (DRY-RUN)"}\n`);
  if (!commit) { console.log(CHUNK.content); console.log("\n(rode com --commit para gravar)\n"); return; }
  const embedding = await embed(`${CHUNK.title}\n${CHUNK.content}`);
  if (existente) await prisma.knowledgeChunk.update({ where: { id: existente.id }, data: { content: CHUNK.content, embedding } });
  else await prisma.knowledgeChunk.create({ data: { clientId: c.id, title: CHUNK.title, content: CHUNK.content, embedding } });

  // Anexa a capacidade ao chunk de cada produto. Idempotente: se o texto já está
  // lá, não duplica — o script pode rodar de novo sem sujar o acervo.
  for (const a of ANEXOS) {
    const alvo = await prisma.knowledgeChunk.findFirst({ where: { clientId: c.id, title: a.titulo }, select: { id: true, content: true } });
    if (!alvo) { console.log(`   ⚠️ não achei o chunk "${a.titulo}" — capacidade NÃO anexada`); continue; }
    if (alvo.content.includes(a.texto)) { console.log(`   = já tinha: ${a.titulo}`); continue; }
    const novoTexto = `${alvo.content.trim()} ${a.texto}`;
    await prisma.knowledgeChunk.update({ where: { id: alvo.id }, data: { content: novoTexto, embedding: await embed(`${a.titulo}\n${novoTexto}`) } });
    console.log(`   + capacidade anexada: ${a.titulo}`);
  }
  console.log(`✅ gravado · acervo: ${await prisma.knowledgeChunk.count({ where: { clientId: c.id } })}\n`);
  await prisma.$disconnect();
};
if (process.argv[1]?.includes("jr-acervo-espetos")) principal().catch((e) => { console.error(e); process.exit(1); });
