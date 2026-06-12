/**
 * Re-cifra os segredos (tokens Meta/WhatsApp) com a ENCRYPTION_KEY atual.
 * Use ao rotacionar a chave: defina ENCRYPTION_KEY (nova) + ENCRYPTION_KEY_OLD
 * (anterior, ou NEXTAUTH_SECRET legado) e rode este script UMA vez.
 *
 * Idempotente: decifra com a cadeia de chaves e re-cifra com a atual.
 *   npx tsx scripts/reencrypt-secrets.ts
 */
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, DecryptError } from "@/lib/crypto";

async function main() {
  let meta = 0, wa = 0, failed = 0;

  for (const c of await prisma.metaConnection.findMany({ select: { id: true, accessToken: true } })) {
    try {
      const plain = decryptSecret(c.accessToken);
      await prisma.metaConnection.update({ where: { id: c.id }, data: { accessToken: encryptSecret(plain) } });
      meta++;
    } catch (e) {
      failed++;
      console.error(`[reencrypt] meta ${c.id} falhou:`, e instanceof DecryptError ? e.message : e);
    }
  }

  for (const c of await prisma.waConnection.findMany({ select: { id: true, accessToken: true, appSecret: true } })) {
    try {
      const token = encryptSecret(decryptSecret(c.accessToken));
      const appSecret = c.appSecret ? encryptSecret(decryptSecret(c.appSecret)) : null;
      await prisma.waConnection.update({ where: { id: c.id }, data: { accessToken: token, appSecret } });
      wa++;
    } catch (e) {
      failed++;
      console.error(`[reencrypt] wa ${c.id} falhou:`, e instanceof DecryptError ? e.message : e);
    }
  }

  console.log(`[reencrypt] concluído. Meta: ${meta} · WhatsApp: ${wa} · Falhas: ${failed}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
