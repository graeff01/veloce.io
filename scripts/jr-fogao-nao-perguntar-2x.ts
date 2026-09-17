/**
 * Conserta regressão introduzida hoje por mim: a pergunta "embutido ou separado?"
 * estava disparando também em quem JÁ tinha dito qual.
 *
 * Caso: "quero a gourmet com fogão 4 bocas" → a IA perguntou se o fogão era
 * embutido ou separado. "4 bocas" é especificação de Fogão Campeiro; não há
 * ambiguidade. Perguntar o que o cliente acabou de responder irrita e custa turno.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

const ANCORA = `Se o cliente NÃO deixou claro qual dos dois, PERGUNTE antes de mostrar qualquer coisa: "O fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?"`;

const NOVO = `${ANCORA}
⚠️ NÃO PERGUNTE se ele JÁ disse qual — repetir o que o cliente acabou de responder irrita. Já está claro quando ele diz:
→ SEPARADO (Fogão Campeiro): "fogão 4 bocas", "fogão 3 bocas", "campeirinho", "fogão campeiro", "fogão do lado", "fogão separado", ou nomeia um conjunto ("gourmet com fogão 4 bocas", "prime 9 com fogão").
→ EMBUTIDO: "embutido", "dentro da churrasqueira", "acoplado", "integrado", "bifeteira", "fogão a gás", "lado aberto", "em balanço".
Só "fogão a lenha" sozinho NÃO decide — a lenha existe nos dois: aí PERGUNTE.`;

async function main() {
  const ch = await prismaUnscoped.knowledgeChunk.findFirst({
    where: { clientId: CLIENTE, title: { contains: "Lado aberto" } },
    select: { id: true, content: true },
  });
  if (!ch) { console.log("ABORTADO: bloco não encontrado"); process.exit(1); }
  if (ch.content.includes("NÃO PERGUNTE se ele JÁ disse qual")) { console.log("já aplicado"); process.exit(0); }
  const n = ch.content.split(ANCORA).length - 1;
  console.log(`âncora aparece ${n}x`);
  if (n !== 1) { console.log("ABORTADO: âncora não é única"); process.exit(1); }

  writeFileSync(`${process.env.HOME}/Downloads/jr-conhecimento-fogao-backup-2026-09-17b.txt`, ch.content);
  const novo = ch.content.replace(ANCORA, NOVO);
  const r = await prismaUnscoped.knowledgeChunk.updateMany({
    where: { id: ch.id, content: ch.content }, data: { content: novo },
  });
  if (r.count !== 1) { console.log("ABORTADO: o bloco mudou desde a leitura"); process.exit(1); }
  console.log(`${ch.content.length} -> ${novo.length} (+${novo.length - ch.content.length}) ✓`);
  for (const a of ["PERGUNTE, NÃO ADIVINHE", "A PARRILLA NÃO TEM FOGÃO", "LADO ABERTO — a lista COMPLETA", "ESPELHAR O LADO"]) {
    console.log(`  intacto "${a.slice(0, 30)}":`, novo.includes(a));
  }
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
