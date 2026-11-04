/**
 * Apontamentos da Maria (documento de 03/11/2026) que são ACERVO.
 *
 * Só entra aqui o que ela afirmou com todas as letras. O que ela não disse —
 * notadamente O QUE ACOMPANHA a Linha Prime — fica de fora de propósito: foi * justamente inventar isso que gerou o erro (a IA deu a lista da Tradição
 * Gourmet para uma Prime 9 espetos, num produto de R$ 1.447).
 *
 * Uso (DRY-RUN por padrão):
 *   railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
 *     export DATABASE_URL=\$DATABASE_PUBLIC_URL; npx tsx scripts/jr-acervo-maria-nov.ts"'
 *   ...e de novo com --commit.
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
    // Apontamento 4. Palavras da Maria, quase literais — a taxonomia é dela.
    title: "Linha Prime e Linha Exclusiva — como as linhas se organizam",
    content:
      "COMO AS LINHAS SE ORGANIZAM — use isto antes de dizer que um modelo 'não é Prime'.\n" +
      "LINHA PRIME: churrasqueiras fabricadas 100% em TIJOLOS REFRATÁRIOS e CONCRETO REFRATÁRIO. É a linha guarda-chuva.\n" +
      "LINHA EXCLUSIVA: os modelos com FOGÃO EMBUTIDO (Tradição, Tradição Gourmet, Gourmet, Gourmet Supreme) estão DENTRO da Linha Prime. São chamados de Linha Exclusiva porque são modelos exclusivos da loja — é uma CATEGORIA dentro da Prime, não uma linha separada.\n" +
      "PORTANTO: dizer que a Tradição Gourmet 'não é da Linha Prime' está ERRADO. Ela é Prime, categoria Exclusiva.\n" +
      "CUIDADO AO RESPONDER O QUE ACOMPANHA: pertencer à mesma linha NÃO significa ter os mesmos itens inclusos. Os modelos por nº de espetos (Prime 7, 9, 11, 16, 32) são produtos DIFERENTES da Tradição Gourmet e da Gourmet — NUNCA repita a lista de itens de um modelo para outro. Se não houver lista específica daquele modelo no acervo, NÃO invente: diga que confirma com o vendedor.",
  },
  {
    // Apontamento 9. A medida do conjunto estava errada na boca da IA (304cm).
    title: "Medida de CONJUNTO — a largura é a soma das peças",
    content:
      "A largura de um CONJUNTO é a SOMA das peças que o compõem. Não existe medida de conjunto 'de cabeça' — some as partes.\n" +
      "EXEMPLO CONFERIDO PELA LOJA: Prime 11 espetos + Forno e Fogão 3 bocas + Forno Napoli = 81 cm + 155 cm + 81 cm = 341 cm de largura total.\n" +
      "ATENÇÃO: a IA já informou 304 cm para esse conjunto, e estava errado. O certo é 341 cm.\n" +
      "LARGURA DAS PEÇAS para somar: Prime 7 = 60 cm; Prime 9 = 74 cm; Prime 11 = 81 cm; Prime 16 = 105 cm; Forno e Fogão 3 bocas = 155 cm; Forno Napoli = 81 cm.\n" +
      "Se faltar a largura de alguma peça do conjunto pedido, NÃO estime: diga que confirma a medida exata com o vendedor.",
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
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error("JR não encontrada"); process.exit(1); }
  const antes = await prisma.knowledgeChunk.count({ where: { clientId: c.id } });
  console.log(`\n${c.name} — acervo atual: ${antes} trecho(s)${commit ? "" : "   (DRY-RUN)"}\n`);

  let criados = 0, atualizados = 0;
  for (const ch of CHUNKS) {
    const existe = await prisma.knowledgeChunk.findFirst({ where: { clientId: c.id, title: ch.title }, select: { id: true } });
    console.log(`  ${existe ? "↻ atualiza" : "+ cria    "}  ${ch.title}`);
    if (!commit) { console.log(`             ${ch.content.replace(/\n/g, "\n             ").slice(0, 600)}\n`); continue; }
    const embedding = await embed(`${ch.title}\n${ch.content}`);
    if (existe) { await prisma.knowledgeChunk.update({ where: { id: existe.id }, data: { content: ch.content, embedding } }); atualizados++; }
    else { await prisma.knowledgeChunk.create({ data: { clientId: c.id, title: ch.title, content: ch.content, embedding } }); criados++; }
  }
  console.log(commit
    ? `\n✅ criados ${criados} · atualizados ${atualizados} · acervo agora ${await prisma.knowledgeChunk.count({ where: { clientId: c.id } })}\n`
    : `\n(DRY-RUN) ${CHUNKS.length} trecho(s) prontos. Rode com --commit.\n`);
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
