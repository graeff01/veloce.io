/**
 * Três lacunas de ACERVO apontadas pela Maria (documento de 24/09/2026).
 *
 * Nenhuma era bug de código: a IA respondeu com o que tinha. O que faltava era o
 * dado. Por isso entram como conhecimento, e não como regra no prompt — prompt já
 * tem 188 ordens competindo entre si, e fato de produto é acervo.
 *
 * ADITIVO de propósito: títulos NOVOS, que não sobrescrevem os chunks existentes
 * de "Churrasqueira Gourmet" e "Churrasqueira Tradição Gourmet" (o upsert é por
 * título). Aqueles já trazem preço e medidas; estes completam o que falta.
 *
 * Uso (DRY-RUN por padrão — mostra e não grava):
 *   railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
 *     export DATABASE_URL=\"$DATABASE_PUBLIC_URL\"; npx tsx scripts/jr-acervo-maria.ts"'
 *   ...e de novo com --commit para gravar.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const key = process.env.OPENAI_API_KEY;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
if (!key) { console.error("OPENAI_API_KEY ausente (rode via railway run --service veloce.io)"); process.exit(1); }
const commit = process.argv.includes("--commit");

const CHUNKS: { title: string; content: string }[] = [
  {
    // Apontamento 1 da Maria: "acho que ainda não cadastramos isso".
    title: "O que acompanha cada churrasqueira (itens inclusos)",
    content:
      "ITENS QUE JÁ VÊM COM A CHURRASQUEIRA, sem custo adicional — responda com esta lista quando o cliente perguntar o que acompanha, o que vem junto ou o que está incluso.\n" +
      "CHURRASQUEIRA GOURMET: suporte de fundo para espeto suspenso; grelha parrilla uruguaia; bifeteira de chama dupla a gás; acabamentos em aço inox na boca da churrasqueira. (Além disso ela tem o fogão a gás embutido e o lado balanceado.)\n" +
      "CHURRASQUEIRA TRADIÇÃO GOURMET: suporte de fundo para espeto suspenso; grelha parrilla uruguaia; fogão a lenha embutido com porta e gaveta de cinzas; acabamentos em aço inox na boca da churrasqueira.\n" +
      "LINHA POPULAR: acompanha kit inox com suporte para espetos e grelha moeda.\n" +
      "ATENÇÃO — não confundir com os ACESSÓRIOS da Gourmet (Forno Mini Peppe, Prensa Completa, Disco de Arado, Char Broiler, espeto rotary, porta-legumes, Forno Gourmet a gás, Parrilla de embutir): esses são VENDIDOS À PARTE e entram no orçamento como opcionais. Os itens listados acima JÁ VÊM no produto e NÃO se cobram de novo.",
  },
  {
    // Apontamento 3: a IA acertou o dado (a Parrilla tem 81cm) e errou a
    // prioridade comercial, que ela não tinha como saber.
    // O título e o texto precisam falar a LÍNGUA DA PERGUNTA, não a minha: a
    // primeira versão deste trecho NÃO era recuperada para "vocês tem
    // churrasqueira de 85?" — que é exatamente a pergunta que gerou o erro.
    // Verificado por similaridade contra o acervo antes de gravar.
    title: "Vocês têm churrasqueira de 85 cm? — largura de cada modelo",
    content:
      "\"Vocês têm churrasqueira de 85?\" \"Tem de 90 cm?\" \"E de 1 metro?\" \"Qual a largura?\" — a JR não faz sob medida, então a resposta é o modelo de largura MAIS PRÓXIMA:\n" +
      "85 cm ou 80 cm → PRIME 11 ESPETOS (81 cm). 75 cm → Popular Tijolinho 75. 90 cm → Prime 9 (74 cm) ou Prime 11 (81 cm). 1 metro ou mais → Tradição, Tradição Gourmet ou Gourmet (105 cm), ou Prime 16 (105 cm). 60 cm → Prime 7. 55 a 65 cm → Linha Popular.\n" +
      "OFEREÇA SEMPRE a Prime, a Tradição ou a Gourmet: são as de maior procura. As PARRILLAS (81 cm e 105 cm) têm POUCA saída — NUNCA responda Parrilla como \"a mais próxima\" de uma medida; só ofereça se o cliente pedir parrilla pelo nome.",
  },
  {
    // Apontamento 4: a Maria escreveu a resposta ideal; vai literal.
    title: "Sob medida — a JR não fabrica",
    content:
      "A JR NÃO FAZ CHURRASQUEIRA SOB MEDIDA. A pré-moldada é fabricada em FORMAS com medidas definidas, então não há como alterar largura, profundidade ou altura de um modelo.\n" +
      "RESPOSTA AO CLIENTE (use este teor): 'Infelizmente não fazemos sob medida, pois a pré-moldada é fabricada em formas com medidas definidas. Mas temos diversos outros modelos! Vou lhe enviar o nosso catálogo para você conhecer todos os modelos e tamanhos.' — e então envie o catálogo (enviar_catalogo).\n" +
      "NÃO confundir com o SUPORTE DE FUNDO e a GRELHA avulsos, que a JR FABRICA sim sob medida, em aço carbono ou inox, a partir de 3 medidas (largura interna, profundidade interna e altura da boca). Sob medida vale para esses acessórios, nunca para a churrasqueira em si.",
  },
];

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
  const client = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.error("Cliente JR não encontrado"); process.exit(1); }
  const antes = await prisma.knowledgeChunk.count({ where: { clientId: client.id } });
  console.log(`\n${client.name} — acervo atual: ${antes} trecho(s)${commit ? "" : "   (DRY-RUN — nada é gravado)"}\n`);

  let criados = 0, atualizados = 0;
  for (const ch of CHUNKS) {
    const existente = await prisma.knowledgeChunk.findFirst({ where: { clientId: client.id, title: ch.title }, select: { id: true } });
    console.log(`  ${existente ? "↻ atualiza" : "+ cria    "}  ${ch.title}`);
    if (!commit) { console.log(`             ${ch.content.replace(/\n/g, "\n             ").slice(0, 700)}\n`); continue; }
    const embedding = await embed(`${ch.title}\n${ch.content}`);
    if (existente) { await prisma.knowledgeChunk.update({ where: { id: existente.id }, data: { content: ch.content, embedding } }); atualizados++; }
    else { await prisma.knowledgeChunk.create({ data: { clientId: client.id, title: ch.title, content: ch.content, embedding } }); criados++; }
  }

  console.log(commit
    ? `\n✅ criados: ${criados} · atualizados: ${atualizados} · acervo agora: ${await prisma.knowledgeChunk.count({ where: { clientId: client.id } })}\n`
    : `\n(DRY-RUN) ${CHUNKS.length} trechos prontos. Rode de novo com --commit para gravar.\n`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
