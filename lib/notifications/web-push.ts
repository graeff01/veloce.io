import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { captureException } from "@/lib/observability";

// Configura VAPID uma vez (lazy). Chaves geradas com `npx web-push generate-vapid-keys`.
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contato@veloce.io", pub, priv);
  configured = true;
  return true;
}

export function pushAvailable(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Envia para TODAS as inscrições do usuário. Inscrição expirada (404/410) é
// removida; outras falhas incrementam o contador (poda futura).
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  if (!ensureConfigured()) return false;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return false;

  let anyOk = false;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        anyOk = true;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), failureCount: 0 } });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } }).catch(() => {});
          captureException(e, { where: "push.send", userId });
        }
      }
    }),
  );
  return anyOk;
}

// Envia para os VENDEDORES do portal de um cliente (PortalPushSubscription). Alcança o
// vendedor mesmo com o portal fechado. `excludeEmail` evita notificar quem disparou a ação.
// Best-effort: inscrição expirada (404/410) é removida; retorna quantos dispositivos ok.
export async function sendPushToPortalClient(clientId: string, payload: PushPayload, opts?: { excludeEmail?: string }): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await prisma.portalPushSubscription.findMany({
    where: { clientId, ...(opts?.excludeEmail ? { email: { not: opts.excludeEmail } } : {}) },
  });
  if (subs.length === 0) return 0;

  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
        ok++;
        await prisma.portalPushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), failureCount: 0 } });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await prisma.portalPushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          await prisma.portalPushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } }).catch(() => {});
          captureException(e, { where: "push.portal.send", clientId });
        }
      }
    }),
  );
  return ok;
}
