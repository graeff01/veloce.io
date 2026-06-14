import { prismaUnscoped } from "@/lib/prisma";

// Retenção e exclusão de dados da IA (LGPD).
//
// pruneOldAiLogs: anonimiza o TEXTO das interações antigas (mantém métricas/decisão
//   para auditoria, mas remove o conteúdo pessoal). Roda no agendador interno.
// eraseContactAiData: direito ao esquecimento — apaga, sob demanda, os dados que a IA
//   guardou de um contato (texto das interações + perfil de qualificação) e o silencia.

const RETENTION_DAYS = Number(process.env.AI_LOG_RETENTION_DAYS || 180);

export async function pruneOldAiLogs(): Promise<{ anonymized: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const res = await prismaUnscoped.aiInteraction.updateMany({
    where: { createdAt: { lt: cutoff }, OR: [{ inbound: { not: null } }, { outbound: { not: null } }] },
    data: { inbound: null, outbound: null, toolCalls: undefined, contextUsed: undefined },
  });
  return { anonymized: res.count };
}

export async function eraseContactAiData(contactId: string): Promise<{ interactions: number; profileRemoved: boolean }> {
  const [inter, prof] = await prismaUnscoped.$transaction([
    prismaUnscoped.aiInteraction.updateMany({
      where: { contactId },
      data: { inbound: null, outbound: null, toolCalls: undefined, contextUsed: undefined },
    }),
    prismaUnscoped.leadProfile.deleteMany({ where: { contactId } }),
  ]);
  // Não volta a abordar o contato após a exclusão.
  await prismaUnscoped.waContact.update({ where: { id: contactId }, data: { aiOptedOut: true, aiOptedOutAt: new Date() } }).catch(() => {});
  return { interactions: inter.count, profileRemoved: prof.count > 0 };
}
