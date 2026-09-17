import { prismaUnscoped as db } from "@/lib/prisma";
const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
(async () => {
  console.log("banco:", (process.env.DATABASE_URL ?? "").replace(/:[^:@/]+@/, ":***@").replace(/\?.*/, "").slice(0, 80));
  const cfg = await db.aiAgentConfig.findUnique({ where: { clientId: CLIENTE }, select: { customPrompt: true, updatedAt: true } });
  const p = cfg?.customPrompt ?? "";
  console.log("prompt:", p.length, "chars · atualizado em", cfg?.updatedAt?.toISOString().slice(0, 16));
  for (const marca of ["VOCÊ NÃO ALTERA NADA", "NÃO é pergunta específica", "REGRA Nº 0 DA ABERTURA"]) {
    console.log(`  ${p.includes(marca) ? "✓ PRESENTE" : "✗ AUSENTE "} · "${marca}"`);
  }
  const conns = (await db.waConnection.findMany({ where: { clientId: CLIENTE }, select: { id: true } })).map(c => c.id);
  const ult = await db.waMessage.findFirst({ where: { contact: { connectionId: { in: conns } } }, orderBy: { timestamp: "desc" }, select: { timestamp: true } });
  console.log("última mensagem da JR neste banco:", ult?.timestamp.toISOString().slice(0, 16));
  await db.$disconnect();
})();
