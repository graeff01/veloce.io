/**
 * Cria (ou atualiza) um usuário de acesso CLIENTE, travado a um cliente.
 *
 * Uso:
 *   npx tsx scripts/create-client-user.ts <email> <senha> <clientId> "<nome>"
 *
 * Ex.:
 *   npx tsx scripts/create-client-user.ts cliente@boqueirao.com Senha123 cmph8j12n002k3hql3pfc3j5b "Boqueirão"
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

async function main() {
  const [email, senha, clientId, nome] = process.argv.slice(2);
  if (!email || !senha || !clientId) {
    console.error('Uso: npx tsx scripts/create-client-user.ts <email> <senha> <clientId> "<nome>"');
    process.exit(1);
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) {
    console.error(`Cliente ${clientId} não encontrado.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(senha, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { name: nome ?? client.name, email, password: passwordHash, role: "CLIENT", clientId, active: true },
    update: { password: passwordHash, role: "CLIENT", clientId, active: true, deletedAt: null },
  });

  console.log(`✓ Usuário CLIENTE pronto: ${user.email} → cliente "${client.name}" (${clientId})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
