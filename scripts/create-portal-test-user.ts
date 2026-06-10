import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/portal-auth";

async function main() {
  // Pegar o primeiro cliente ativo
  const client = await prisma.client.findFirst({
    where: { deletedAt: null, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  if (!client) {
    console.error("Nenhum cliente ativo encontrado.");
    process.exit(1);
  }

  const email = "teste@portal.com";
  const password = "Veloce@2024";

  // Habilitar portal no cliente
  await prisma.client.update({
    where: { id: client.id },
    data: { portalEnabled: true },
  });

  // Criar ou atualizar credencial
  const hash = await hashPassword(password);

  const cred = await prisma.customerPortalCredential.upsert({
    where: { email },
    create: {
      clientId: client.id,
      email,
      passwordHash: hash,
      name: "Usuário de Teste",
      role: "viewer",
      active: true,
    },
    update: {
      clientId: client.id,
      passwordHash: hash,
      active: true,
    },
  });

  console.log("\n✅ Credencial criada com sucesso!\n");
  console.log(`   Cliente : ${client.name} (${client.id})`);
  console.log(`   Email   : ${email}`);
  console.log(`   Senha   : ${password}`);
  console.log(`   Acesso  : https://veloceio-production.up.railway.app/portal/login`);
  console.log(`   Cred ID : ${cred.id}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
