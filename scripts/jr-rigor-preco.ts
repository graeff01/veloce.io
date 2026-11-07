/**
 * Liga o RIGOR MÁXIMO de preço na JR: `groundingEnforce`.
 *
 * Sem ele, preço sem fonte (nem na tabela, nem no acervo, nem na conversa, nem
 * no resultado de uma ferramenta) só fica REGISTRADO e a resposta sai assim
 * mesmo. Com ele, a resposta é barrada, o lead ouve que o vendedor confirma, e o
 * vendedor recebe a ficha e uma tarefa (ver respond.ts, abstenção).
 *
 * As outras travas de preço (preço revogado, preço do produto errado) barram
 * sempre e não dependem disto.
 *
 * Antes de ligar, rode jr-trava-preco-medir.ts e leia os casos de "preço sem
 * fonte": cada um é uma resposta que passaria a ser barrada.
 *
 * Uso (DRY-RUN por padrão):
 *   railway run --service Postgres bash -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL";
 *     npx tsx scripts/jr-rigor-preco.ts [--commit]'
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const commit = process.argv.includes("--commit");

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error("JR não encontrada"); process.exit(1); }
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: c.id }, select: { groundingEnforce: true } });
  if (!cfg) { console.error("JR sem AiAgentConfig"); process.exit(1); }
  console.log(`\n${c.name} — groundingEnforce hoje: ${cfg.groundingEnforce ? "LIGADO" : "desligado (só registra)"}`);
  if (cfg.groundingEnforce) { console.log("✅ Já está no rigor máximo. Nada a fazer.\n"); await prisma.$disconnect(); return; }
  if (!commit) { console.log("(DRY-RUN) Rode com --commit para ligar.\n"); await prisma.$disconnect(); return; }
  await prisma.aiAgentConfig.update({ where: { clientId: c.id }, data: { groundingEnforce: true } });
  console.log("✅ Ligado: preço sem fonte agora é barrado.\n");
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
