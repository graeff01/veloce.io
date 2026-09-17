/**
 * Pedido da Maria (áudio de 17/09): quando o cliente pede CHURRASQUEIRA COM FOGÃO
 * sem dizer QUAIS, o certo é mandar o catálogo completo — que tem churrasqueiras e
 * fogões — e só depois perguntar qual agradou mais.
 *
 * Hoje o prompt trata "gourmet com fogão 4 bocas" e "churrasqueira com fogão" como
 * a mesma coisa. No primeiro os dois modelos estão nomeados e a FOTO resolve. No
 * segundo não há o que fotografar: são DUAS escolhas em aberto (qual churrasqueira
 * × qual fogão), e perguntar "qual modelo?" é cedo — ele ainda não viu nada.
 *
 * Entra como EXCEÇÃO ao lado da regra, não reescrevendo ela: o caminho da foto
 * (modelo nomeado) e o de produto único ficam intactos.
 *
 * Lê, mostra o diff, salva backup e grava ancorado no conteúdo lido.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

const ANCORA = `Só quando ele ainda NÃO disse o que quer é que você pergunta de leve se procura um MODELO ESPECÍFICO ou o CATÁLOGO COMPLETO (ex.: "Você procura algum modelo específico ou prefere que eu envie o catálogo completo? 😊").`;

const ADENDO = ` ⚠️ EXCEÇÃO — CONJUNTO SEM MODELO NOMEADO: se ele pediu os DOIS produtos juntos mas NÃO disse quais ("churrasqueira com fogão", "uma churrasqueira e um fogão campeiro", "o conjunto"), NÃO pergunte "modelo ou catálogo" e NÃO mande foto — não há o que fotografar, são DUAS escolhas em aberto. Mande o CATÁLOGO COMPLETO direto (enviar_catalogo) — ele tem as churrasqueiras E os fogões — e DEPOIS pergunte qual modelo agradou mais (ex.: "Dá uma olhada e me diz qual te agradou mais 😊"). Isso vale SÓ pro conjunto genérico: se ele nomeou os dois ("gourmet com fogão 4 bocas"), é FOTO, como está acima; se pediu um produto só ("quero uma churrasqueira"), você PERGUNTA, como está acima. E continua valendo a ordem: no primeiro contato, a pergunta de loja e o VÍDEO vêm ANTES do catálogo.`;

async function main() {
  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({
    where: { clientId: CLIENTE }, select: { customPrompt: true },
  });
  const antes = cfg?.customPrompt ?? "";
  const n = antes.split(ANCORA).length - 1;
  console.log(`âncora aparece ${n}x`);
  if (n !== 1) { console.log("ABORTADO: âncora não é única"); process.exit(1); }
  if (antes.includes("CONJUNTO SEM MODELO NOMEADO")) { console.log("já aplicado"); process.exit(0); }

  const depois = antes.replace(ANCORA, ANCORA + ADENDO);
  const backup = `${process.env.HOME}/Downloads/jr-prompt-backup-2026-09-17.txt`;
  writeFileSync(backup, antes);
  console.log(`backup: ${backup}`);
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
  for (const a of ["REGRA Nº 0 DA ABERTURA", "VOCÊ NÃO ALTERA NADA", "NÃO é pergunta específica",
                   "MANDAR A FOTO desse modelo", "O motor cobra o acesso.", "enviar_video"]) {
    console.log(`  intacto "${a.slice(0, 28)}":`, agora.includes(a));
  }
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
