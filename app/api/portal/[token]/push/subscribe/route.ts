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
