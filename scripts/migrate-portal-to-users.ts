/**
 * Migra credenciais do portal antigo (CustomerPortalCredential) para usuários
 * unificados (User com role=CLIENT + clientId). Idempotente: pula e-mails que já
 * existem como User. O passwordHash (bcrypt) é copiado direto para User.password.
 *
 * Uso: npx tsx scripts/migrate-portal-to-users.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const creds = await prisma.customerPortalCredential.findMany({
    where: { active: true },
    include: { client: { select: { name: true } } },
  });

  console.log(`[migrate] ${creds.length} credencial(is) de portal ativa(s) encontrada(s).`);

  let created = 0;
  let skipped = 0;

  for (const c of creds) {
    const existing = await prisma.user.findUnique({ where: { email: c.email } });
    if (existing) {
      console.log(`[migrate] já existe User para ${c.email} — pulando.`);
      skipped++;
      continue;
    }

    await prisma.user.create({
      data: {
        name: c.name ?? c.client.name,
        email: c.email,
        password: c.passwordHash, // já é bcrypt — compatível com o login interno
        role: "CLIENT",
        clientId: c.clientId,
        active: true,
      },
    });
    console.log(`[migrate] criado User CLIENT para ${c.email} (cliente: ${c.client.name}).`);
    created++;
  }

  console.log(`[migrate] concluído. Criados: ${created} · Pulados: ${skipped}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
