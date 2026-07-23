// Correção do #5 (montagem por PEÇA FÍSICA): a IA deve SEMPRE itemizar cada peça no
// gerar_orcamento e NUNCA usar chave de combo (conj_*) — porque o combo já embute um
// desconto de montagem e, com um item extra, o motor conta errado (desconto dobrado / 2 peças).
// Todos os combos têm produto = soma das peças, então itemizar é seguro (mesmo preço) e a
// montagem sai por peça física (2=10%, 3+=13%).
//
// Substitui, no customPrompt da JR, o bloco "CONJUNTOS, COMPLEMENTOS E MEDIDAS" pelo texto
// atualizado (idempotente por marcador). DRY-RUN default; use --apply.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

const MARKER = "CONJUNTOS, COMPLEMENTOS E MEDIDAS (regras de orçamento)";
const NEW_BLOCK =
  MARKER + ":\n" +
  "- MEDIDA APROXIMADA: se o cliente perguntar por um tamanho específico (ex.: \"tem uma de 74cm?\"), sempre indique proativamente a medida DISPONÍVEL mais próxima, com o valor aproximado (ex.: \"a mais próxima é a Prime 9, com 74 cm de largura\"). Nunca responda só \"não temos\" — ofereça a opção mais próxima.\n" +
  "- VÁRIOS ITENS / PIA: você PODE e DEVE incluir vários itens-base no MESMO orçamento (ex.: churrasqueira + fogão + pia). NUNCA diga que \"o sistema só aceita um item por orçamento\" — é FALSO. Pia, bancada, balcão e complementos que EXISTEM no catálogo (pia_gourmet, pia_inox, bancada_gourmet, balcao_1m...) NÃO são \"custom\": são itens-base. Inclua no orçamento — NÃO escale por causa disso.\n" +
  "- MONTAGEM É POR PEÇA FÍSICA: a montagem é cobrada por CADA peça. Sempre que o orçamento tiver mais de um produto (um conjunto, ou churrasqueira + fogão + pia etc.), monte o gerar_orcamento ITEMIZANDO cada peça como item-base individual (ex.: base = [prime_16, fogao_campeiro_4, pia_gourmet]). NUNCA use as chaves de combo (conj_*) no gerar_orcamento — elas já vêm com o desconto de montagem embutido e bagunçam a conta quando há itens extras. Itemizando, o preço do produto é EXATAMENTE o mesmo e o desconto de montagem sai correto.\n" +
  "- DESCONTO DE MONTAGEM (automático, por nº de PEÇAS físicas): 2 peças = 10%; 3 peças ou mais = 13%. As \"combinações\" do catálogo são só sugestões de arranjo — na hora de orçar, itemize as peças.";

async function main() {
  const jr = await prisma.client.findFirst({ where: { name: { contains: "JR", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!jr) throw new Error("JR não encontrada");
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: jr.id }, select: { customPrompt: true } });
  const cp = cfg?.customPrompt ?? "";
  console.log(`Cliente: ${jr.name}`);
  console.log(APPLY ? "\n*** APPLY ***\n" : "\n--- DRY-RUN (use --apply) ---\n");

  const idx = cp.indexOf(MARKER);
  if (idx < 0) { console.log("Marcador não encontrado — abortando (o bloco anterior deveria existir)."); return; }
  // O bloco foi anexado no fim; substitui do marcador até o fim pelo novo texto.
  const head = cp.slice(0, idx).trimEnd();
  const newCp = head + "\n\n" + NEW_BLOCK;
  console.log(`customPrompt: ${cp.length} → ${newCp.length} chars`);
  console.log("\n--- NOVO BLOCO ---\n" + NEW_BLOCK);
  if (APPLY) {
    await prisma.aiAgentConfig.update({ where: { clientId: jr.id }, data: { customPrompt: newCp } });
    console.log("\n✓ customPrompt atualizado");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
