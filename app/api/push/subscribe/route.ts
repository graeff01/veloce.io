import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// POST — salva/atualiza a inscrição de push do dispositivo atual.
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Inscrição inválida" }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session!.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers.get("user-agent") ?? null },
    update: { userId: session!.user.id, p256dh: keys.p256dh, auth: keys.auth, lastUsedAt: new Date(), failureCount: 0 },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove a inscrição (desativar no dispositivo).
export async function DELETE(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
