/**
 * Maria aprovou (áudio 17/09 09:46): quando o lead pede "churrasqueira com fogão",
 * PERGUNTAR se é embutido ou fora (Fogão Campeiro ao lado) — e se for fora, mandar
 * o catálogo, "porque tem bastante opção no catálogo".
 *
 * Hoje o conhecimento ADIVINHA: "quando o cliente fala 'a churrasqueira com o
 * fogão', ele se refere ao EMBUTIDO — NÃO acrescente Fogão Campeiro". Medido em
 * 164 pedidos reais: 60% não dizem qual dos dois querem. A adivinhação é moeda.
 *
 * Mexe em DUAS coisas, ancoradas no conteúdo lido, com backup:
 *  1. o bloco de conhecimento "Lado aberto, em balanço, fogão embutido…"
 *  2. o adendo do prompt que eu tinha posto hoje (mandava catálogo SEM perguntar)
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const HOME = process.env.HOME;

// ── 1. conhecimento ───────────────────────────────────────────────────────────
const K_ANCORA = `ERRO A NÃO COMETER: esse fogão/bifeteira JÁ VEM DENTRO da churrasqueira. Ele NÃO é o Fogão Campeiro, que é um produto SEPARADO, vendido para ficar AO LADO. Quando o cliente fala "a churrasqueira com o fogão", ele se refere ao EMBUTIDO — NÃO acrescente Fogão Campeiro ao orçamento.`;

const K_NOVO = `⚠️ "CHURRASQUEIRA COM FOGÃO" — PERGUNTE, NÃO ADIVINHE. Duas coisas diferentes atendem por esse mesmo nome:
(a) fogão EMBUTIDO, que já vem DENTRO da churrasqueira — TRADIÇÃO GOURMET (a lenha), GOURMET (bifeteira a gás) e TRADIÇÃO (a lenha, essa sem o lado aberto);
(b) FOGÃO CAMPEIRO, peça SEPARADA que fica AO LADO — são os conjuntos "Prime N espetos + Fogão", "Gourmet + Fogão Campeiro" e afins.
Se o cliente NÃO deixou claro qual dos dois, PERGUNTE antes de mostrar qualquer coisa: "O fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?"
• Respondeu EMBUTIDO → são poucos: apresente Tradição Gourmet, Gourmet e Tradição.
• Respondeu SEPARADO/AO LADO → tem bastante opção: mande o CATÁLOGO COMPLETO (enviar_catalogo) e peça pra ele dizer qual agradou mais.
Medido em 164 pedidos reais: 6 em cada 10 clientes não dizem qual dos dois querem. Por isso a pergunta.

⛔ A PARRILLA NÃO TEM FOGÃO — nem embutido, nem acompanhando. Ela tem o LADO ABERTO, que é outra coisa. Nunca a apresente como "churrasqueira com fogão".

ERRO A NÃO COMETER: o fogão/bifeteira EMBUTIDO já vem DENTRO da churrasqueira e NÃO é o Fogão Campeiro. Nunca acrescente Fogão Campeiro ao orçamento de quem pediu o embutido, nem cobre o embutido como peça à parte.`;

// ── 2. prompt ─────────────────────────────────────────────────────────────────
const P_ANCORA = `Mande o CATÁLOGO COMPLETO direto (enviar_catalogo) — ele tem as churrasqueiras E os fogões — e DEPOIS pergunte qual modelo agradou mais (ex.: "Dá uma olhada e me diz qual te agradou mais 😊").`;

const P_NOVO = `PRIMEIRO pergunte de que fogão ele fala: "O fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?" (ver o bloco "Lado aberto… fogão embutido" no CONHECIMENTO). Se ele disser SEPARADO/AO LADO → mande o CATÁLOGO COMPLETO (enviar_catalogo) e DEPOIS pergunte qual agradou mais (ex.: "Dá uma olhada e me diz qual te agradou mais 😊"). Se disser EMBUTIDO → são poucos modelos, apresente eles direto, sem catálogo.`;

async function main() {
  // ---- conhecimento
  const ch = await prismaUnscoped.knowledgeChunk.findFirst({
    where: { clientId: CLIENTE, title: { contains: "Lado aberto" } },
    select: { id: true, content: true },
  });
  if (!ch) { console.log("ABORTADO: bloco não encontrado"); process.exit(1); }
  if (ch.content.includes("PERGUNTE, NÃO ADIVINHE")) { console.log("conhecimento: já aplicado"); }
  else {
    const n = ch.content.split(K_ANCORA).length - 1;
    console.log(`conhecimento · âncora aparece ${n}x`);
    if (n !== 1) { console.log("ABORTADO: âncora não é única"); process.exit(1); }
    writeFileSync(`${HOME}/Downloads/jr-conhecimento-fogao-backup-2026-09-17.txt`, ch.content);
    const novo = ch.content.replace(K_ANCORA, K_NOVO);
    const r = await prismaUnscoped.knowledgeChunk.updateMany({
      where: { id: ch.id, content: ch.content }, data: { content: novo },
    });
    if (r.count !== 1) { console.log("ABORTADO: o bloco mudou desde a leitura"); process.exit(1); }
    console.log(`conhecimento · ${ch.content.length} -> ${novo.length} (+${novo.length - ch.content.length}) ✓`);
    for (const a of ["LADO ABERTO — a lista COMPLETA", "ESPELHAR O LADO", "a lenha ou a gás", "só a churrasqueira com fogão"]) {
      console.log(`   intacto "${a.slice(0, 30)}":`, novo.includes(a));
    }
  }

  // ---- prompt
  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({ where: { clientId: CLIENTE }, select: { customPrompt: true } });
  const antes = cfg?.customPrompt ?? "";
  if (antes.includes("O fogão você quer embutido")) { console.log("prompt: já aplicado"); }
  else {
    const n = antes.split(P_ANCORA).length - 1;
    console.log(`\nprompt · âncora aparece ${n}x`);
    if (n !== 1) { console.log("ABORTADO: âncora não é única"); process.exit(1); }
    writeFileSync(`${HOME}/Downloads/jr-prompt-backup-2026-09-17b.txt`, antes);
    const depois = antes.replace(P_ANCORA, P_NOVO);
    const r = await prismaUnscoped.aiAgentConfig.updateMany({
      where: { clientId: CLIENTE, customPrompt: antes }, data: { customPrompt: depois },
    });
    if (r.count !== 1) { console.log("ABORTADO: o prompt mudou desde a leitura"); process.exit(1); }
    console.log(`prompt · ${antes.length} -> ${depois.length} (+${depois.length - antes.length}) ✓`);
    for (const a of ["REGRA Nº 0 DA ABERTURA", "VOCÊ NÃO ALTERA NADA", "MANDAR A FOTO desse modelo", "enviar_video"]) {
      console.log(`   intacto "${a.slice(0, 28)}":`, depois.includes(a));
    }
  }
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
