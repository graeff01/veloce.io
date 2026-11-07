/**
 * Correções de 04/11/2026 — o erro do "forno Iglu" e o que a Maria mandou.
 *
 * O QUE ACONTECEU. A IA ofereceu a um lead um conjunto "com forno Iglu", somou
 * peças na mão chegando a um valor sem fonte, e quando o lead apontou a contradição ("o 11
 * é mais barato que o 9?") inventou que o Iglu custa diferente do Napoli.
 *
 * A CAUSA, lida na conversa: o LEAD escreveu "iglu" primeiro. A IA ADOTOU o nome
 * e colou num produto real ("forno e fogão 3 bocas embutidos"), repetindo dez
 * vezes como se fosse catálogo. Não foi invenção dela — foi concordância. Mesmo
 * vício do "Popular com 7 espetos" (22/09).
 *
 * CORREÇÃO DE ROTA: eu tinha classificado "3 em 1" como produto inexistente.
 * Estava errado — a Maria confirmou que existe o Trio Linha Prime. Só o "Iglu"
 * é que não existe.
 *
 * Uso (DRY-RUN por padrão):
 *   railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
 *     export DATABASE_URL=\$DATABASE_PUBLIC_URL; npx tsx scripts/jr-acervo-conjuntos.ts"'
 *
 * PREÇOS: tabela de nov/2026. Rode pelo scripts/jr-pendentes.sh, que acerta a
 * ordem com a troca de tabela (jr-tabela-nov2026.ts).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const key = process.env.OPENAI_API_KEY;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
if (!key) { console.error("OPENAI_API_KEY ausente (rode via railway run --service veloce.io)"); process.exit(1); }
const commit = process.argv.includes("--commit");


// ── POR QUE A TABELA DE MEDIDAS NÃO ESTÁ AQUI ────────────────────────────────
// A Maria mandou a tabela completa em 04/11, e ela DIVERGE do que já está no
// acervo (trecho "MEDIDAS — tabela única de todos os modelos") em sete alturas:
//   Prime 16          acervo 2,50 m  ×  Maria 2,30 m
//   Tradição          acervo 2,50 m  ×  Maria 2,30 m
//   Tradição Gourmet  acervo 2,60 m  ×  Maria 2,30 m
//   Gourmet           acervo 2,60 m  ×  Maria 2,30 m
//   Lareira meio de peça  1,80 × 1,70
//   Lareira de canto      1,55 × 1,35
//   Lareira em L 60x60    1,65 × 1,55
//
// ATUALIZAÇÃO 07/11: o CATÁLOGO NOVO da Maria (nov/2026) traz Prime 16 2,50 m,
// Tradição 2,50 m, Tradição Gourmet 2,60 m e Gourmet 2,60 m — os valores que JÁ
// estão no acervo. As quatro churrasqueiras ficam como estão. As três lareiras
// não estão nesse catálogo e seguem aguardando.
//
// Gravar as duas faria a IA ter duas respostas para a mesma pergunta — pior que
// não ter nenhuma. Medida errada em churrasqueira pré-moldada é produto que não
// entra no vão da pessoa.
//
// Aguarda a Maria confirmar qual vale. Quando confirmar, ATUALIZE o trecho que
// já existe (mesmo título) em vez de criar outro.

const CHUNKS: { title: string; content: string }[] = [
  {
    title: "FORNOS — só existe o Forno Napoli (não existe forno Iglu)",
    content: [
      "O ÚNICO FORNO SEPARADO DA JR É O FORNO NAPOLI. NÃO EXISTE 'forno Iglu' — esse nome não é nosso. Se o cliente usar, corrija com gentileza e ofereça o Napoli ou o Forno e Fogão.",
      "'FORNO E FOGÃO 3 BOCAS' e 'FORNO E FOGÃO 4 BOCAS' são UM PRODUTO ÚNICO cada: uma peça só, com forno e fogão juntos. NÃO são 'um forno' mais 'um fogão', e esse forno NÃO tem nome próprio. Nunca separe o nome em duas coisas.",
      "O cliente pode MESCLAR como quiser: escolhe o tamanho da churrasqueira, e depois escolhe entre o Forno e Fogão (3 ou 4 bocas) OU o fogão separado mais o Forno Napoli.",
      "FORNO MINI PEPPE e FORNO GOURMET A GÁS existem, mas são ACESSÓRIOS à parte da linha Gourmet — não são o forno de um conjunto.",
      "ERRO REAL (04/11/2026): o lead escreveu 'iglu' e a IA passou a oferecer 'forno Iglu' num orçamento. O produto verdadeiro era 'Prime 11 espetos + Forno e Fogão 4 bocas'.",
    ].join("\n"),
  },
  {
    title: "TRIO / 3x1 — o conjunto padrão e como oferecer",
    content: [
      "SIM, EXISTE O 3x1 (também chamado TRIO LINHA PRIME). Quando o cliente perguntar por 'trio', '3x1' ou '3 em 1', é disto que ele fala — não diga que não temos.",
      "O MAIS PADRÃO: Churrasqueira Linha Prime modelo 9 espetos (74 cm) + Forno e Fogão de 3 bocas. Valor R$ 4.204,00 (tabela nov/2026). Medidas externas do conjunto: 2,29 m de largura x 60 cm de profundidade x 2,30 m de altura.",
      "COMO RESPONDER, nesta ordem: (1) envie a FOTO e o VALOR desse conjunto padrão; (2) diga que o cliente pode alterar o tamanho da churrasqueira (temos 60 cm, 74 cm, 81 cm e 105 cm) e que também há um forno e fogão maior; (3) envie o CATÁLOGO COMPLETO para ele escolher.",
      "Não pergunte qual tamanho antes de mostrar: mostre o padrão primeiro e ofereça as variações depois.",
    ].join("\n"),
  },
  {
    title: "CONJUNTOS têm preço PRÓPRIO — nunca some as peças",
    content: [
      "CADA CONJUNTO TEM PREÇO PRÓPRIO NO SISTEMA, que NÃO é a soma das peças avulsas. NUNCA calcule o valor de um conjunto somando produtos — use gerar_orcamento.",
      "Se o cliente pedir uma combinação que NÃO está na lista abaixo, não invente um valor somando: diga que confirma com o vendedor.",
      // Tabela de nov/2026 (catálogo novo da Maria). A versão anterior deste
      // trecho trazia os valores VELHOS e sem "R$" — o script de troca de tabela
      // não os enxergaria. E chamava de "Prime 16" o conjunto com Napoli de
      // 1,62 m, que é 11 espetos (81 + 81).
      "CONJUNTOS QUE EXISTEM (preço do conjunto, sem frete — tabela nov/2026): Popular Lisa 55 + Campeirinho R$ 2.024; Popular Lisa 65 + Campeirinho R$ 2.144; Prime 7 + Campeirinho R$ 2.474; Prime 9 + Campeirinho R$ 2.684; Prime 9 + Fogão 3 bocas R$ 3.214; Prime 9 + Fogão 4 bocas R$ 3.824; Prime 11 + Campeirinho R$ 2.794; Prime 11 + Fogão 3 bocas R$ 3.324; Prime 11 + Fogão 4 bocas R$ 3.934; Prime 16 + Fogão 4 bocas R$ 4.404; Prime 9 + Forno e Fogão 3 bocas R$ 4.204 (o TRIO padrão); Prime 11 + Forno e Fogão 4 bocas R$ 4.884; Prime 7 + Forno Napoli + Campeirinho R$ 4.111; Prime 9 + Forno Napoli + Campeirinho R$ 4.321; Prime 11 + Forno Napoli (1,62 m) R$ 3.264; Prime 16 + Forno Napoli (1,86 m) R$ 3.734; Prime 16 + Forno Napoli + Forno e Fogão 3 bocas R$ 6.421; Tradição Gourmet + Forno Napoli R$ 6.154; Gourmet + Forno Napoli R$ 6.044; Gourmet + Campeirinho R$ 5.574; Gourmet + Fogão 3 bocas R$ 6.104; Gourmet + Fogão 4 bocas R$ 6.714; Gourmet + Forno e Fogão 3 bocas R$ 7.094; Gourmet + Forno e Fogão 4 bocas R$ 7.664.",
      "ERRO REAL (04/11/2026): a IA somou peças na mão e deu um valor para um conjunto fora dessa lista, e ainda ficou mais caro que um conjunto maior — o lead percebeu antes dela.",
    ].join("\n"),
  },
  {
    title: "Conjunto maior NUNCA custa menos — se a conta não fecha, pare",
    content: [
      "ANTES DE MANDAR DOIS PREÇOS JUNTOS, COMPARE: um conjunto com MAIS peças ou churrasqueira MAIOR não pode custar MENOS que um menor. Se os números que você ia dizer têm essa contradição, você errou em algum deles.",
      "NESSE CASO: NÃO invente explicação para a diferença (não diga que 'um forno custa diferente do outro'). PARE, diga que confirma o valor exato com o vendedor, e use escalar_humano.",
      "SE O CLIENTE APONTAR UMA CONTRADIÇÃO SUA, reconheça e corrija. Nunca mude de assunto nem peça dados pessoais para desviar.",
      "ERRO REAL (04/11/2026): a IA deu para a Prime 11 + Forno e Fogão um valor MENOR que o de um conjunto Prime 9 somado na mão; o lead perguntou 'mas você tá dizendo que o 11 é mais barato que o 9?' e ela inventou uma explicação e pediu CPF.",
    ].join("\n"),
  },
  {
    title: "Cliente usou um nome que não existe — corrija, não concorde",
    content: [
      "SE O CLIENTE CHAMAR UM PRODUTO POR UM NOME QUE NÃO É NOSSO, NÃO ADOTE O NOME. Concordar para agradar faz você vender o que não temos.",
      "O QUE FAZER: diga com naturalidade que esse nome não é o nosso e ofereça o produto REAL mais próximo. Ex.: 'Esse a gente não tem com esse nome, mas temos o Forno Napoli — é isso que você procura?'",
      "NUNCA repita o nome inventado como se fosse nosso, nem coloque o produto real entre parênteses ao lado dele. Repetir ensina o cliente que o produto existe.",
      "VALE PARA NÚMEROS TAMBÉM: se o cliente disser capacidade, medida ou preço diferente do nosso, o NOSSO dado é que vale.",
      "ATENÇÃO — ESTES NOMES SÃO DE VERDADE e não devem ser corrigidos: '3x1', 'trio' e '3 em 1' (= Trio Linha Prime). Já 'forno Iglu' NÃO existe.",
      "ERROS REAIS: 04/11 — o lead escreveu 'iglu' e a IA passou a oferecer 'forno Iglu' num orçamento; 22/09 — o lead disse '7 espetos' na Popular, que comporta 4, e ela concordou.",
    ].join("\n"),
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
  console.log(`\n${c.name} — acervo: ${await prisma.knowledgeChunk.count({ where: { clientId: c.id } })}${commit ? "" : "  (DRY-RUN)"}\n`);
  let criados = 0, atualizados = 0;
  for (const ch of CHUNKS) {
    const existe = await prisma.knowledgeChunk.findFirst({ where: { clientId: c.id, title: ch.title }, select: { id: true } });
    console.log(`  ${existe ? "↻" : "+"} ${ch.title}`);
    if (!commit) continue;
    const embedding = await embed(`${ch.title}\n${ch.content}`);
    if (existe) { await prisma.knowledgeChunk.update({ where: { id: existe.id }, data: { content: ch.content, embedding } }); atualizados++; }
    else { await prisma.knowledgeChunk.create({ data: { clientId: c.id, title: ch.title, content: ch.content, embedding } }); criados++; }
  }
  console.log(commit ? `\n✅ ${criados} criado(s), ${atualizados} atualizado(s) · acervo agora ${await prisma.knowledgeChunk.count({ where: { clientId: c.id } })}\n` : `\n(DRY-RUN) ${CHUNKS.length} trecho(s) prontos. Rode com --commit.\n`);
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
