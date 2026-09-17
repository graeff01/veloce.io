/**
 * Respostas da Maria (17/09) às 6 perguntas. Aplica 1, 2 e 4 no conhecimento
 * (a 3 já estava certa; 5 e 6 são os recortes do PDF, feitos à parte).
 *
 * 1. CORRIGE ERRO MEU, que está no ar: escrevi "a Parrilla não tem fogão — nem
 *    embutido, nem acompanhando". A segunda metade é FALSA. Maria: "os fogões e
 *    fornos podem ser montados junto com QUALQUER churrasqueira, inclusive as
 *    Parrillas — o cliente escolhe a churrasqueira e o fogão e monta o conjunto".
 *    Do jeito que está, a IA recusaria uma venda válida.
 *    Isso também reenquadra o "separado": os 23 conjuntos do catálogo são as
 *    combinações PRONTAS, não a lista do que é possível.
 *
 * 2. Gourmet Supreme: NÃO oferecer para quem pede fogão a gás (R$ 14.897 assusta).
 *    Só para quem procura churrasqueira ROTATIVA/AUTOMATIZADA.
 *
 * 4. Falar "fogão a gás" com o cliente, não "bifeteira".
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

const ANCORA = `⛔ A PARRILLA NÃO TEM FOGÃO — nem embutido, nem acompanhando. Ela tem o LADO ABERTO, que é outra coisa. Nunca a apresente como "churrasqueira com fogão".`;

const NOVO = `⛔ PARRILLA: não tem fogão EMBUTIDO (o que ela tem é o LADO ABERTO, que é outra coisa) — nunca a apresente como "churrasqueira com fogão embutido". MAS ela ENTRA em conjunto normalmente, como qualquer churrasqueira.

✅ QUALQUER CHURRASQUEIRA + QUALQUER FOGÃO (confirmado pela Maria): fogões campeiros e fornos podem ser montados junto com QUALQUER modelo de churrasqueira, Parrillas incluídas. O cliente escolhe a churrasqueira que quer e o fogão que quer, e a gente monta o conjunto. Os conjuntos que aparecem no catálogo ("Prime 9 + Fogão 3 bocas" etc.) são as combinações PRONTAS — não são a lista do que é possível. NUNCA diga que uma combinação "não existe" ou "não temos esse conjunto": monte o orçamento itemizando as peças (gerar_orcamento) e siga normal.

💰 GOURMET SUPREME (R$ 14.897) — NÃO OFEREÇA POR PADRÃO. Ela tem fogão a gás embutido (dupla chama), mas o valor é bem mais alto e assusta quem não está procurando isso. Quem pede "churrasqueira com fogão a gás" recebe a GOURMET, só. Ofereça a Supreme SOMENTE quando o cliente vier procurando churrasqueira ROTATIVA, AUTOMATIZADA, "com motor", "que gira sozinha", "automática" ou com controle remoto — aí sim ela é a resposta.

🗣️ COMO FALAR: diga "fogão a gás" para o cliente, não "bifeteira" — ele entende melhor. "Bifeteira" é o nome técnico do catálogo; use só se o próprio cliente usar.`;

async function main() {
  const ch = await prismaUnscoped.knowledgeChunk.findFirst({
    where: { clientId: CLIENTE, title: { contains: "Lado aberto" } },
    select: { id: true, content: true },
  });
  if (!ch) { console.log("ABORTADO: bloco não encontrado"); process.exit(1); }
  if (ch.content.includes("QUALQUER CHURRASQUEIRA + QUALQUER FOGÃO")) { console.log("já aplicado"); process.exit(0); }
  const n = ch.content.split(ANCORA).length - 1;
  console.log(`âncora aparece ${n}x`);
  if (n !== 1) { console.log("ABORTADO: âncora não é única"); process.exit(1); }

  writeFileSync(`${process.env.HOME}/Downloads/jr-conhecimento-fogao-backup-2026-09-17c.txt`, ch.content);
  const novo = ch.content.replace(ANCORA, NOVO);
  const r = await prismaUnscoped.knowledgeChunk.updateMany({
    where: { id: ch.id, content: ch.content }, data: { content: novo },
  });
  if (r.count !== 1) { console.log("ABORTADO: o bloco mudou desde a leitura"); process.exit(1); }
  console.log(`${ch.content.length} -> ${novo.length} (+${novo.length - ch.content.length}) ✓`);
  console.log(`  a afirmação errada saiu:`, !novo.includes("nem embutido, nem acompanhando"));
  for (const a of ["PERGUNTE, NÃO ADIVINHE", "NÃO PERGUNTE se ele JÁ disse qual", "LADO ABERTO — a lista COMPLETA", "ESPELHAR O LADO", "apresente Tradição Gourmet, Gourmet e Tradição"]) {
    console.log(`  intacto "${a.slice(0, 34)}":`, novo.includes(a));
  }
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
