/**
 * Prova temporal: no dia em que o Henrique "corrigiu" a IA e ela respondeu
 * "vou ajustar aqui", NENHUMA linha de cadastro foi escrita.
 * Também lista TODA escrita de cadastro dos últimos 60 dias, com autor.
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const DIA_INI = new Date("2026-09-05T00:00:00Z");
const DIA_FIM = new Date("2026-09-06T00:00:00Z");

async function main() {
  console.log(`=== 05/09 — o dia da "correção" do Henrique (ela disse "vou ajustar aqui" às 14:52) ===\n`);

  const cfg = await db.aiAgentConfig.count({ where: { clientId: CLIENTE, updatedAt: { gte: DIA_INI, lt: DIA_FIM } } });
  const kn  = await db.knowledgeChunk.count({ where: { clientId: CLIENTE, createdAt: { gte: DIA_INI, lt: DIA_FIM } } });
  const cat = await db.catalogItem.count({ where: { clientId: CLIENTE, updatedAt: { gte: DIA_INI, lt: DIA_FIM } } });
  const pc  = await db.pricingConfig.count({ where: { clientId: CLIENTE, updatedAt: { gte: DIA_INI, lt: DIA_FIM } } });
  for (const [nome, n] of [["AiAgentConfig (prompt/config)", cfg], ["KnowledgeChunk (conhecimento)", kn], ["CatalogItem (catálogo)", cat], ["PricingConfig (preços)", pc]] as [string, number][]) {
    console.log(`  ${n === 0 ? "✓ ZERO escritas" : `⚠️  ${n} escrita(s)`} · ${nome}`);
  }

  console.log(`\n=== toda escrita de cadastro nos últimos 60 dias, e QUEM fez (trilha de auditoria) ===`);
  const desde = new Date(Date.now() - 60 * 864e5);
  const audits = await db.auditLog.findMany({
    where: { clientId: CLIENTE, createdAt: { gte: desde } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, action: true, userId: true },
  });
  const relevantes = audits.filter((a) => /prompt|knowledge|pricing|catalog|config|ai\./i.test(a.action));
  console.log(`registros de auditoria: ${audits.length} (${relevantes.length} tocam cadastro)`);
  for (const a of relevantes.slice(-25)) {
    console.log(`  ${a.createdAt.toISOString().slice(0, 16)} · ${a.action} · ${a.userId ?? "(sem usuário)"}`);
  }

  console.log(`\n=== a IA tem usuário no sistema? (se não, não consegue nem aparecer nessa trilha) ===`);
  const users = await db.user.count();
  console.log(`  usuários do painel: ${users} · a IA não autentica: não existe sessão/usuário para ela`);

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
