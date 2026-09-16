/**
 * Fecha a brecha que fez a IA pular a pergunta de "primeiro contato" — e com
 * ela o vídeo de apresentação.
 *
 * Caso real (Lucas, 16/09): o lead abriu com "gostaria de modelos e valores",
 * a IA pediu o nome, perguntou "churrasqueira, fogão campeiro ou lareira?",
 * ele respondeu "churrasqueira com fogão" — e a IA foi direto para conjuntos e
 * foto, sem perguntar "primeiro contato?". A trava do enviar_video impediu o
 * vídeo (ela exige a pergunta antes), mas a pergunta nunca veio.
 *
 * A regra existe. O que a derrubou foi a cláusula de flexibilidade logo
 * depois: o modelo leu "churrasqueira com fogão" como PERGUNTA ESPECÍFICA.
 *
 * Lê, mostra o diff e grava ancorado no conteúdo lido.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

const ANCORA = `RESPONDA a dúvida dele antes de fazer a pergunta de loja — curto e natural. NUNCA ignore a pergunta do cliente pra forçar a de loja.`;

const ADENDO = ` ⚠️ MAS "pergunta específica" é DÚVIDA TÉCNICA (medida, material, instalação, como funciona) — dizer QUAL PRODUTO quer NÃO é pergunta específica. "Churrasqueira com fogão", "quero a Gourmet", "modelos e valores", "quero uma churrasqueira" são ESCOLHA DE PRODUTO: aí a pergunta de loja vem PRIMEIRO, sem exceção. E se o produto só ficar claro DEPOIS (você perguntou "churrasqueira, fogão campeiro ou lareira?" e ele respondeu "churrasqueira"), a pergunta de loja vale NAQUELE momento — não pule por já ter passado do turno do nome.`;

async function main() {
  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({
    where: { clientId: CLIENTE }, select: { customPrompt: true },
  });
  const antes = cfg?.customPrompt ?? "";
  const n = antes.split(ANCORA).length - 1;
  console.log(`âncora aparece ${n}x`);
  if (n !== 1) { console.log("ABORTADO: âncora não é única"); process.exit(1); }
  if (antes.includes("NÃO é pergunta específica")) { console.log("já aplicado"); process.exit(0); }

  const depois = antes.replace(ANCORA, ANCORA + ADENDO);
  writeFileSync("/tmp/video-antes.txt", antes);
  console.log(`${antes.length} -> ${depois.length} (+${depois.length - antes.length})`);

  const r = await prismaUnscoped.aiAgentConfig.updateMany({
    where: { clientId: CLIENTE, customPrompt: antes },
    data: { customPrompt: depois },
  });
  if (r.count !== 1) { console.log("NÃO gravado — o prompt mudou desde a leitura"); process.exit(1); }

  const agora = (await prismaUnscoped.aiAgentConfig.findUnique({
    where: { clientId: CLIENTE }, select: { customPrompt: true },
  }))?.customPrompt ?? "";
  console.log("idêntico ao preparado:", agora === depois);
  for (const a of ["REGRA Nº 0 DA ABERTURA", "COMO LER A RESPOSTA", "você VÊ a imagem", "O motor cobra o acesso.", "enviar_video"]) {
    console.log(`  intacto "${a.slice(0, 26)}":`, agora.includes(a));
  }
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
