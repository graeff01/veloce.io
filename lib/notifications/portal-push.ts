import { prisma } from "@/lib/prisma";
import { sendPushToPortalClient } from "./web-push";
import { sendPushToPortalDevices } from "./device-push";

// Alertas de Web Push pros vendedores do portal (com o portal FECHADO). Best-effort:
// resolve o token do portal p/ o link e dispara pra todos os dispositivos inscritos.
//
// DOIS TRANSPORTES, UMA DECISÃO: o PWA recebe por Web Push (VAPID) exatamente como
// sempre; o app iOS recebe por APNs. O QUE dispara e QUANDO não mudou uma linha —
// só passou a existir um segundo destinatário. Sem APNS_* configurado, o ramo do
// aparelho sai imediatamente e nada nesta função muda de comportamento.

export async function pushPortalReview(clientId: string, detail?: string): Promise<void> {
  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true } });
  if (!portal) return;
  const title = "📋 Orçamento pra revisar";
  const body = detail || "Um orçamento aguarda seu aval antes de ir ao cliente.";
  await Promise.all([
    sendPushToPortalClient(clientId, { title, body, url: `/r/${portal.token}/revisao` }).catch(() => {}),
    sendPushToPortalDevices(clientId, { title, body, route: "revisao", collapseId: "revisao" }).catch(() => {}),
  ]);
}

// `ownerEmail`: se a conversa tem DONA, só ela recebe a notificação de fechamento (o cliente
// é dela — feedback da Maria). Sem dona, notifica todos os vendedores (fallback).
export async function pushPortalFechamento(clientId: string, detail?: string, ownerEmail?: string | null): Promise<void> {
  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true } });
  if (!portal) return;
  const title = "🔥 Lead quer fechar";
  const body = detail || "Um lead aprovou o orçamento e quer fechar.";
  // A regra da dona da conversa (`onlyEmail`) vale igual nos dois transportes.
  const only = ownerEmail ? { onlyEmail: ownerEmail } : undefined;
  await Promise.all([
    sendPushToPortalClient(clientId, { title, body, url: `/r/${portal.token}/fechamento` }, only).catch(() => {}),
    sendPushToPortalDevices(clientId, { title, body, route: "fechamento", collapseId: "fechamento" }, only ?? {}).catch(() => {}),
  ]);
}
