import { prismaUnscoped } from "@/lib/prisma";

// Trilha de auditoria de ações sensíveis (LGPD/segurança). Best-effort: nunca lança.
export async function recordAudit(a: {
  clientId?: string | null;
  userId?: string | null;
  action: string;          // ex: data.erase | ai.config | ai.pause | review.submit
  target?: string | null;  // recurso afetado (contactId, etc.)
  meta?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  await prismaUnscoped.auditLog.create({
    data: {
      clientId: a.clientId ?? null, userId: a.userId ?? null, action: a.action,
      target: a.target ?? null, meta: (a.meta ?? undefined) as object | undefined, ip: a.ip ?? null,
    },
  }).catch(() => {});
}
