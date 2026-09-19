/**
 * Fecha o ciclo que a Maria desenhou: quem responde "Fogão Campeiro separado"
 * recebe o RECORTE dos conjuntos (23 páginas), não o catálogo inteiro (43).
 *
 * Sem isto, os recortes existem e a ferramenta sabe enviá-los, mas o conhecimento
 * continua mandando "o CATÁLOGO COMPLETO" — e o cliente recebe as 43 páginas
 * como antes.
 *
 * ⚠️ RODAR DEPOIS de scripts/jr-catalogos-config.ts: se a chave 'conjunto_fogao'
 * não estiver configurada, a IA pediria uma categoria que não existe e cairia no
 * catálogo completo. O script confere isso e aborta.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { lerCatalogos } from "@/lib/ai-agent/catalogos";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

const ANCORA = `• Respondeu SEPARADO/AO LADO → tem bastante opção: mande o CATÁLOGO COMPLETO (enviar_catalogo) e peça pra ele dizer qual agradou mais.`;

const NOVO = `• Respondeu SEPARADO/AO LADO → tem bastante opção: mande o catálogo SÓ DOS CONJUNTOS — enviar_catalogo com categoria 'conjunto_fogao' — e peça pra ele dizer qual agradou mais. NÃO mande o catálogo completo aqui: o recorte já traz todas as combinações de churrasqueira com fogão e forno, sem as páginas que não interessam agora.`;

async function main() {
  // 1) A chave precisa existir, senão a IA pede categoria inexistente.
  const pc = await prismaUnscoped.pricingConfig.findUnique({ where: { clientId: CLIENTE }, select: { rules: true } });
  const catalogos = lerCatalogos(pc?.rules);
  const tem = catalogos.some((c) => c.chave === "conjunto_fogao");
  console.log(`recortes configurados: ${catalogos.map((c) => c.chave).join(", ") || "nenhum"}`);
  if (!tem) {
    console.log(`ABORTADO: 'conjunto_fogao' não está configurado. Rode antes: npx tsx scripts/jr-catalogos-config.ts`);
    process.exit(1);
  }

  // 2) Ajusta o conhecimento.
  const ch = await prismaUnscoped.knowledgeChunk.findFirst({
    where: { clientId: CLIENTE, title: { contains: "Lado aberto" } },
    select: { id: true, content: true },
  });
  if (!ch) { console.log("ABORTADO: bloco não encontrado"); process.exit(1); }
  if (ch.content.includes("'conjunto_fogao'")) { console.log("já aplicado"); process.exit(0); }
  const n = ch.content.split(ANCORA).length - 1;
  console.log(`âncora aparece ${n}x`);
  if (n !== 1) { console.log("ABORTADO: âncora não é única"); process.exit(1); }

  writeFileSync(`${process.env.HOME}/Downloads/jr-conhecimento-fogao-backup-2026-09-19.txt`, ch.content);
  const novo = ch.content.replace(ANCORA, NOVO);
  const r = await prismaUnscoped.knowledgeChunk.updateMany({
    where: { id: ch.id, content: ch.content }, data: { content: novo },
  });
  if (r.count !== 1) { console.log("ABORTADO: o bloco mudou desde a leitura"); process.exit(1); }
  console.log(`${ch.content.length} -> ${novo.length} (+${novo.length - ch.content.length}) ✓`);
  for (const a of ["PERGUNTE, NÃO ADIVINHE", "QUALQUER CHURRASQUEIRA + QUALQUER FOGÃO", "GOURMET SUPREME", "ESPELHAR O LADO"]) {
    console.log(`  intacto "${a.slice(0, 34)}":`, novo.includes(a));
  }
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
