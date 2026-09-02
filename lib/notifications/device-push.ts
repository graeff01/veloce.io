// ── Despacho para aparelhos iOS ───────────────────────────────────────────────
// Espelha a assinatura de sendPushToPortalClient (web-push.ts) de propósito: quem
// chama não precisa saber qual transporte existe. O PWA segue no VAPID; o app,
// aqui. Nenhuma regra de QUANDO notificar mora neste arquivo.

import { prisma } from "@/lib/prisma";
import { sendApns, isDeadToken, apnsConfig, type ApnsPayload } from "./apns";
import { captureException } from "@/lib/observability";

export interface DevicePushOptions {
  /** Notificar só este vendedor (ex.: a dona da conversa). */
  onlyEmail?: string | null;
}

const MAX_FALHAS = 5;

/**
 * Envia para todos os aparelhos do cliente (ou de um vendedor). Best-effort:
 * nunca lança — uma falha de push não pode derrubar o fluxo que a originou.
 */
export async function sendPushToPortalDevices(
  clientId: string,
  payload: ApnsPayload,
  opts: DevicePushOptions = {},
): Promise<{ enviados: number; removidos: number }> {
  // Sem credencial APNs o recurso está desligado: sai antes de tocar o banco.
  if (!apnsConfig()) return { enviados: 0, removidos: 0 };

  let devices: { id: string; token: string; environment: string; failureCount: number }[] = [];
  try {
    devices = await prisma.deviceToken.findMany({
      where: { clientId, ...(opts.onlyEmail ? { email: opts.onlyEmail } : {}) },
      select: { id: true, token: true, environment: true, failureCount: true },
    });
  } catch (e) {
    // Tabela ausente (migração ainda não aplicada) não pode quebrar a notificação
    // do PWA, que já foi disparada por quem nos chamou.
    captureException(e, { where: "device-push.list" });
    return { enviados: 0, removidos: 0 };
  }

  let enviados = 0;
  let removidos = 0;
  const mortos: string[] = [];

  for (const d of devices) {
    const r = await sendApns(d.token, payload, d.environment === "sandbox" ? "sandbox" : "production");
    if (r.ok) {
      enviados++;
      if (d.failureCount > 0) {
        await prisma.deviceToken.update({ where: { id: d.id }, data: { failureCount: 0, lastUsedAt: new Date() } }).catch(() => {});
      }
      continue;
    }
    if (isDeadToken(r.reason, r.status)) {
      mortos.push(d.id);
      continue;
    }
    // Falha transitória: conta e só desiste do aparelho depois de insistir.
    const falhas = d.failureCount + 1;
    if (falhas >= MAX_FALHAS) mortos.push(d.id);
    else await prisma.deviceToken.update({ where: { id: d.id }, data: { failureCount: falhas } }).catch(() => {});
  }

  if (mortos.length) {
    const r = await prisma.deviceToken.deleteMany({ where: { id: { in: mortos } } }).catch(() => null);
    removidos = r?.count ?? 0;
  }

  return { enviados, removidos };
}

/** Remove os aparelhos de uma sessão revogada (logout / "sair deste aparelho"). */
export async function forgetDevice(clientId: string, deviceId: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { clientId, deviceId } }).catch(() => {});
}
