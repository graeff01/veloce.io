/**
 * Maria (resposta 4): "pode se referir como fogão a gás pra eles entenderem melhor".
 *
 * A regra sozinha não segurou — testado, a IA continuou dizendo "bifeteira",
 * porque os BLOCOS DO PRODUTO abrem com essa palavra e é ela que a IA lê e repete.
 * Conserta na fonte: o termo principal vira "fogão a gás", com "bifeteira" entre
 * parênteses para quem usar o nome técnico.
 *
 * ⚠️ NÃO tocar em "bifeteira 26x26": essa é um ACESSÓRIO vendido separadamente na
 * Tradição Gourmet, coisa completamente diferente do fogão embutido. Trocar ali
 * inventaria um produto.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

const TROCAS: { bloco: string; de: string; para: string }[] = [
  { bloco: "Churrasqueira Gourmet",
    de: "Bifeteira a gás embutida",
    para: "Fogão a gás embutido (no catálogo aparece como \"bifeteira\")" },
  { bloco: "Churrasqueira Gourmet Supreme",
    de: "Bifeteira de dupla chama a gás embutida",
    para: "Fogão a gás de dupla chama embutido (no catálogo aparece como \"bifeteira\")" },
  { bloco: "Lado aberto",
    de: "GOURMET (R$ 4.197) — BIFETEIRA A GÁS embutida.",
    para: "GOURMET (R$ 4.197) — FOGÃO A GÁS embutido (o catálogo chama de \"bifeteira\"; com o cliente, fale fogão a gás)." },
];

async function main() {
  for (const t of TROCAS) {
    const ch = await prismaUnscoped.knowledgeChunk.findFirst({
      where: { clientId: CLIENTE, title: { startsWith: t.bloco } },
      select: { id: true, title: true, content: true },
    });
    if (!ch) { console.log(`✗ bloco não encontrado: ${t.bloco}`); continue; }
    if (ch.content.includes(t.para)) { console.log(`· já aplicado: ${ch.title}`); continue; }
    const n = ch.content.split(t.de).length - 1;
    if (n !== 1) { console.log(`✗ ABORTADO em "${ch.title}": âncora aparece ${n}x`); continue; }

    const novo = ch.content.replace(t.de, t.para);
    // Guarda: o acessório 26x26 tem que continuar intacto, onde quer que esteja.
    const acessorioAntes = (ch.content.match(/bifeteira 26x26/gi) ?? []).length;
    const acessorioDepois = (novo.match(/bifeteira 26x26/gi) ?? []).length;
    if (acessorioAntes !== acessorioDepois) { console.log(`✗ ABORTADO: mexeu no acessório 26x26`); continue; }

    writeFileSync(`${process.env.HOME}/Downloads/jr-conhecimento-${t.bloco.slice(0, 18).replace(/\W+/g, "-")}-backup-2026-09-17.txt`, ch.content);
    const r = await prismaUnscoped.knowledgeChunk.updateMany({
      where: { id: ch.id, content: ch.content }, data: { content: novo },
    });
    console.log(r.count === 1 ? `✓ ${ch.title}` : `✗ não gravado (mudou desde a leitura): ${ch.title}`);
  }

  // Confere o acervo inteiro depois.
  const todos = await prismaUnscoped.knowledgeChunk.findMany({ where: { clientId: CLIENTE }, select: { title: true, content: true } });
  const acessorio = todos.filter((c) => /bifeteira 26x26/i.test(c.content)).length;
  console.log(`\nacessório "bifeteira 26x26" preservado em ${acessorio} bloco(s)`);
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
