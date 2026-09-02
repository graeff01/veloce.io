import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — salva/atualiza a inscrição de push do dispositivo do vendedor (clientId+email).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token);
  if (error) return error;
  const email = portal.email;
  if (!email) return NextResponse.json({ error: "Faça login para ativar os avisos." }, { status: 401 });

  const body = await req.json().catch(() => null);

  // ── App nativo (APNs) ───────────────────────────────────────────────────────
  // Ramo ADITIVO: o corpo do PWA (endpoint + keys) não passa por aqui e segue
  // idêntico logo abaixo. O aparelho manda `apnsToken` + `deviceId`.
  const apnsToken = typeof body?.apnsToken === "string" ? body.apnsToken.trim() : "";
  if (apnsToken) {
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    // Device token do APNs é hexadecimal (64 chars hoje, mas o tamanho já mudou:
    // valida formato e faixa, não um número exato).
    if (!/^[0-9a-fA-F]{60,200}$/.test(apnsToken) || !/^[A-Za-z0-9_.:-]{8,128}$/.test(deviceId)) {
      return NextResponse.json({ error: "Inscrição inválida" }, { status: 400 });
    }
    const environment = body?.environment === "sandbox" ? "sandbox" : "production";
    await prisma.deviceToken.upsert({
      where: { token: apnsToken },
      create: { clientId: portal.clientId, email, deviceId, token: apnsToken, platform: "ios", environment },
      update: { clientId: portal.clientId, email, deviceId, environment, lastUsedAt: new Date(), failureCount: 0 },
    });
    return NextResponse.json({ ok: true });
  }

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "Inscrição inválida" }, { status: 400 });
  }

  await prisma.portalPushSubscription.upsert({
    where: { endpoint },
    create: { clientId: portal.clientId, email, endpoint, p256dh, auth, userAgent: req.headers.get("user-agent") ?? null },
    update: { clientId: portal.clientId, email, p256dh, auth, lastUsedAt: new Date(), failureCount: 0 },
  });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a inscrição deste dispositivo (desativar).
export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Desinscrever é anônimo de propósito: o `endpoint` é a URL única do dispositivo
  // (só quem tem o aparelho a conhece) e o efeito é apenas parar de receber avisos.
  const { error, portal } = await guardPortal(req, token, { anonymous: true });
  if (error) return error;
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (endpoint) await prisma.portalPushSubscription.deleteMany({ where: { endpoint, clientId: portal.clientId } });
  return NextResponse.json({ ok: true });
}
