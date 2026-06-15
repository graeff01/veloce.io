import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET — preferências do usuário (cria default se não existir) + status do vínculo Telegram.
export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;
  const userId = session!.user.id;

  const [pref, telegram] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.telegramLink.findUnique({ where: { userId }, select: { username: true, linkedAt: true } }),
  ]);

  return NextResponse.json({
    dailyDigest: pref?.dailyDigest ?? false,
    criticalAlerts: pref?.criticalAlerts ?? false,
    leadMessages: pref?.leadMessages ?? false,
    pushEnabled: pref?.pushEnabled ?? true,
    telegramEnabled: pref?.telegramEnabled ?? true,
    telegramLinked: !!telegram,
    telegramUsername: telegram?.username ?? null,
  });
}

const schema = z.object({
  dailyDigest: z.boolean().optional(),
  criticalAlerts: z.boolean().optional(),
  leadMessages: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
});

// PUT — atualiza preferências.
export async function PUT(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;
  const userId = session!.user.id;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const pref = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...d },
    update: d,
  });

  return NextResponse.json(pref);
}
