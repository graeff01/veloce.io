/**
 * Responde factualmente: quando o Henrique "corrigiu" a IA e ela disse
 * "vou ajustar aqui", ALGUMA COISA foi de fato alterada?
 *
 * Não confia em leitura de código: olha o banco de produção e verifica se
 * houve escrita em cadastro (config/prompt, conhecimento, preços, catálogo)
 * na janela da conversa. Só lê.
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

async function main() {
  const conns = (await db.waConnection.findMany({ where: { clientId: CLIENTE }, select: { id: true } })).map((c) => c.id);
  const contatos = await db.waContact.findMany({
    where: { connectionId: { in: conns }, OR: [
      { name: { contains: "henrique", mode: "insensitive" } },
      { displayName: { contains: "henrique", mode: "insensitive" } },
    ] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, name: true, displayName: true, waId: true, lastMessageAt: true },
  });
  console.log(`contatos "henrique": ${contatos.length}`);
  const alvo = contatos[0];
  if (!alvo) { console.log("não encontrado"); await db.$disconnect(); return; }
  console.log(`alvo: ${alvo.displayName ?? alvo.name} · ${alvo.waId}\n`);

  const msgs = await db.waMessage.findMany({
    where: { contactId: alvo.id }, orderBy: { timestamp: "asc" },
    select: { direction: true, text: true, timestamp: true, aiGenerated: true },
  });
  console.log("=== a conversa ===");
  for (const m of msgs) {
    const quem = m.direction === "in" ? "LEAD" : m.aiGenerated ? "IA  " : "HUM ";
    console.log(`${m.timestamp.toISOString().slice(5, 16)} ${quem} ${String(m.text ?? "").replace(/\n/g, " ").slice(0, 160)}`);
  }

  const ini = msgs[0]?.timestamp ?? new Date(0);
  const fim = new Date((msgs.at(-1)?.timestamp ?? new Date()).getTime() + 60 * 60 * 1000);
  console.log(`\njanela auditada: ${ini.toISOString().slice(0, 16)} → ${fim.toISOString().slice(0, 16)}`);

  // 1) ferramentas chamadas nessa conversa
  console.log("\n=== ferramentas que a IA chamou nesse contato ===");
  const inter = await db.aiInteraction.findMany({
    where: { clientId: CLIENTE, contactId: alvo.id }, orderBy: { createdAt: "asc" },
    select: { createdAt: true, decision: true, toolCalls: true },
  });
  const usadas = new Map<string, number>();
  for (const i of inter) {
    for (const t of (Array.isArray(i.toolCalls) ? i.toolCalls : []) as { name?: string }[]) {
      if (t?.name) usadas.set(t.name, (usadas.get(t.name) ?? 0) + 1);
    }
  }
  console.log(`interações: ${inter.length} · ferramentas: ${usadas.size ? [...usadas].map(([n, c]) => `${n}×${c}`).join(", ") : "NENHUMA"}`);

  // 2) o cadastro mudou na janela?
  console.log("\n=== houve escrita em CADASTRO na janela? ===");
  const cfg = await db.aiAgentConfig.findUnique({ where: { clientId: CLIENTE }, select: { updatedAt: true, customPrompt: true } });
  const kn = await db.knowledgeChunk.aggregate({ where: { clientId: CLIENTE }, _max: { createdAt: true }, _count: true });
  const cat = await db.catalogItem.aggregate({ where: { clientId: CLIENTE }, _max: { updatedAt: true }, _count: true });
  const pc = await db.pricingConfig.findFirst({ where: { clientId: CLIENTE }, select: { updatedAt: true } });
  const linhas: [string, Date | null | undefined][] = [
    ["AiAgentConfig (prompt/config)", cfg?.updatedAt],
    [`KnowledgeChunk (${kn._count} blocos)`, kn._max.createdAt],
    [`CatalogItem (${cat._count} itens)`, cat._max.updatedAt],
    ["PricingConfig (preços)", pc?.updatedAt],
  ];
  for (const [nome, quando] of linhas) {
    const dentro = quando && quando >= ini && quando <= fim;
    console.log(`  ${dentro ? "⚠️  ALTERADO NA JANELA" : "✓ intacto"} · ${nome} · última escrita: ${quando ? quando.toISOString().slice(0, 16) : "nunca"}`);
  }

  // 3) a ficha do próprio lead (única coisa que a IA escreve)
  console.log("\n=== a ficha deste lead (LeadProfile — o que a IA PODE escrever) ===");
  const lp = await db.leadProfile.findUnique({ where: { contactId: alvo.id }, select: { data: true, updatedAt: true, temperature: true } });
  console.log(lp ? `atualizada em ${lp.updatedAt.toISOString().slice(0, 16)} · ${JSON.stringify(lp.data)}` : "nenhuma ficha criada");

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
