import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

async function main() {
  const conns = (await prismaUnscoped.waConnection.findMany({ where: { clientId: CLIENTE }, select: { id: true } })).map((c) => c.id);

  const contatos = await prismaUnscoped.waContact.findMany({
    where: { connectionId: { in: conns }, OR: [
      { name: { contains: "lucas", mode: "insensitive" } },
      { displayName: { contains: "lucas", mode: "insensitive" } },
    ] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, name: true, displayName: true, waId: true, lastMessageAt: true },
  });
  console.log(`contatos "lucas": ${contatos.length}`);
  for (const c of contatos.slice(0, 5)) {
    console.log(`  ${c.displayName ?? c.name ?? c.waId} · ${c.waId} · última em ${c.lastMessageAt?.toISOString().slice(0, 16) ?? "-"}`);
  }
  const alvo = contatos[0];
  if (!alvo) { await prismaUnscoped.$disconnect(); return; }

  console.log(`\n=== conversa com ${alvo.displayName ?? alvo.name} ===`);
  const msgs = await prismaUnscoped.waMessage.findMany({
    where: { contactId: alvo.id }, orderBy: { timestamp: "asc" },
    select: { direction: true, text: true, type: true, timestamp: true, aiGenerated: true },
  });
  for (const m of msgs) {
    const quem = m.direction === "in" ? "LEAD" : (m.aiGenerated ? "IA  " : "HUM ");
    console.log(`${m.timestamp.toISOString().slice(5, 16)} ${quem} [${m.type}] ${String(m.text ?? "").replace(/\n/g, " ").slice(0, 150)}`);
  }

  console.log(`\n=== o agente rodou nesse contato? ===`);
  const inter = await prismaUnscoped.aiInteraction.findMany({
    where: { clientId: CLIENTE, contactId: alvo.id }, orderBy: { createdAt: "asc" },
    select: { createdAt: true, decision: true, status: true, outbound: true },
  });
  console.log(`interações registradas: ${inter.length}`);
  for (const i of inter) {
    console.log(`  ${i.createdAt.toISOString().slice(5, 16)} ${i.decision}/${i.status} → ${String(i.outbound ?? "").replace(/\n/g, " ").slice(0, 110)}`);
  }
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
