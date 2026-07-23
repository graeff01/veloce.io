// Aplica as melhorias da JR mapeadas no teste da Maria (PDF):
//  #1 fogo a lenha, #3 altura da chaminé, #4 acabamento  → Conhecimento (RAG, com embedding)
//  #2 medida aproximada, #5 conjunto/pia + desconto montagem → Regras (config.rules)
//
// IDEMPOTENTE: conhecimento é upsert por título (apaga o de mesmo título e recria);
// as regras só são anexadas se o marcador ainda não estiver presente.
// DRY-RUN por padrão: mostra o que faria. Passe `--apply` para gravar.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
async function embed(text: string): Promise<number[]> {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY ausente — necessário p/ o embedding do RAG");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding as number[];
}

const KNOWLEDGE: { title: string; content: string }[] = [
  {
    title: "Fogo a lenha — quais linhas permitem",
    content:
      "As churrasqueiras da JR podem funcionar com carvão e também com FOGO A LENHA — exceto uma linha. " +
      "Permitem fogo a lenha: toda a Linha Prime (espetos e Prime Parrilla) e as Exclusivas — Tradição, Tradição Gourmet e Gourmet. " +
      "As Exclusivas também são Linha Prime, mas são uma subcategoria de modelos exclusivos da nossa loja. " +
      "A ÚNICA linha que NÃO permite fogo a lenha é a Linha Popular, porque não possui tijolos refratários na parte superior interna da churrasqueira. " +
      "Resumo: só a Linha Popular não aceita lenha; os demais modelos aceitam lenha e carvão.",
  },
  {
    title: "Altura da chaminé e como aumentar",
    content:
      "A altura padrão da chaminé só funciona bem em AMBIENTE ABERTO, sem obstáculos ao redor. " +
      "Em ÁREA INTERNA (coberta / com paredes ao redor), a chaminé deve ultrapassar NO MÍNIMO 1,50 m acima do telhado para ter uma boa tiragem da fumaça. " +
      "Depois de montada, dá para aumentar a chaminé de duas formas: " +
      "(1) BLOCOS DE CONCRETO — cada peça tem 20 cm de altura e custa R$ 35,00 a unidade; limite de 5 blocos adicionais (até 1 m a mais). " +
      "(2) CANO GALVANIZADO — diâmetro mínimo de 28 cm para boa tiragem, sem limite de altura (sobe quantos metros forem necessários); a JR não trabalha diretamente com os canos, mas indica um funileiro. " +
      "IMPORTANTE: o acabamento acima do telhado e o recorte de forro ou telha NÃO fazem parte da montagem da JR.",
  },
  {
    title: "Acabamento e pintura",
    content:
      "Os produtos da JR vão NATURAIS, em tom de concreto — não vão pintados de fábrica. " +
      "Isso porque é necessário usar massa na montagem, e a pintura de fábrica seria estragada nesse processo. " +
      "Depois de montado, o cliente pode dar o acabamento que quiser, de acordo com o gosto e o ambiente: " +
      "pintura (mesma tinta de parede — PVA ou acrílica à base d'água), textura, plaquetas, cerâmicas, revestimento com gesso acartonado, entre outros. " +
      "Ou seja: não vem com pintura pronta, mas aceita vários tipos de acabamento.",
  },
];

const RULES_MARKER = "MEDIDAS (quando o lead perguntar por tamanho)";
const RULES_ADDITION =
  "\n\n" +
  "MEDIDAS (quando o lead perguntar por tamanho): sempre indique proativamente a medida DISPONÍVEL mais próxima do que ele pediu, com o valor aproximado (ex.: \"a mais próxima é a Prime 9, com 74 cm de largura\"). Nunca responda só \"não temos\" — ofereça sempre a opção mais próxima.\n\n" +
  "CONJUNTOS E COMPLEMENTOS (montar orçamento): você PODE e DEVE incluir VÁRIOS itens-base no MESMO orçamento (ex.: churrasqueira + fogão + pia). NUNCA diga que \"o sistema só aceita um item por orçamento\" — isso é FALSO. Se não existe um combo exato pro que o lead quer, ou se ele quer um conjunto MAIS um complemento (pia, bancada, etc.), monte o orçamento ITEMIZANDO cada peça física como item-base (ex.: prime_16 + fogao_campeiro_4 + pia_gourmet). NÃO misture uma chave de combo (conj_*) com itens extras — itemize tudo em peças individuais. O desconto de montagem é automático por quantidade de peças físicas: 2 peças = 10%, 3 peças ou mais = 13%. O catálogo traz combinações prontas apenas como sugestão — você pode montar qualquer combinação.";

async function main() {
  const jr = await prisma.client.findFirst({ where: { name: { contains: "JR", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!jr) throw new Error("Cliente JR não encontrado");
  console.log(`Cliente: ${jr.name} (${jr.id})`);
  console.log(APPLY ? "\n*** MODO APPLY — vai gravar ***\n" : "\n--- DRY-RUN (nada gravado; use --apply) ---\n");

  // ── Conhecimento (#1, #3, #4) ──
  for (const k of KNOWLEDGE) {
    const existing = await prisma.knowledgeChunk.findFirst({ where: { clientId: jr.id, title: k.title }, select: { id: true } });
    console.log(`[Conhecimento] "${k.title}" — ${existing ? "SUBSTITUI (já existia)" : "NOVO"}`);
    if (APPLY) {
      if (existing) await prisma.knowledgeChunk.delete({ where: { id: existing.id } });
      const embedding = await embed(`${k.title}\n${k.content}`);
      await prisma.knowledgeChunk.create({ data: { clientId: jr.id, title: k.title, content: k.content, embedding } });
      console.log(`   ✓ gravado (embedding ${embedding.length} dims)`);
    }
  }

  // ── Regras (#2, #5) ──
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: jr.id }, select: { rules: true } });
  const cur = cfg?.rules ?? "";
  if (cur.includes(RULES_MARKER)) {
    console.log("\n[Regras] já presentes (marcador encontrado) — nada a fazer.");
  } else {
    console.log("\n[Regras] vai ANEXAR as regras #2 (medida aproximada) e #5 (conjunto/pia + desconto montagem).");
    if (APPLY) {
      await prisma.aiAgentConfig.update({ where: { clientId: jr.id }, data: { rules: cur + RULES_ADDITION } });
      console.log("   ✓ regras anexadas");
    }
  }

  console.log("\nPronto.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
