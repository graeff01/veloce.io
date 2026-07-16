import { prisma } from "@/lib/prisma";
import { sendPushToPortalClient } from "./web-push";

// Alertas de Web Push pros vendedores do portal (com o portal FECHADO). Best-effort:
// resolve o token do portal p/ o link e dispara pra todos os dispositivos inscritos.

export async function pushPortalReview(clientId: string, detail?: string): Promise<void> {
  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true } });
  if (!portal) return;
  await sendPushToPortalClient(clientId, {
    title: "📋 Orçamento pra revisar",
    body: detail || "Um orçamento aguarda seu aval antes de ir ao cliente.",
    url: `/r/${portal.token}/revisao`,
  }).catch(() => {});
}

export async function pushPortalFechamento(clientId: string, detail?: string): Promise<void> {
  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true } });
  if (!portal) return;
  await sendPushToPortalClient(clientId, {
    title: "🔥 Lead quer fechar",
    body: detail || "Um lead aprovou o orçamento e quer fechar.",
    url: `/r/${portal.token}/fechamento`,
  }).catch(() => {});
}
