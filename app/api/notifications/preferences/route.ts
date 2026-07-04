import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET — preferências de notificação do usuário (cria default se não existir).
export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;
  const userId = session!.user.id;

  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });

  return NextResponse.json({
    dailyDigest: pref?.dailyDigest ?? false,
    criticalAlerts: pref?.criticalAlerts ?? false,
    pushEnabled: pref?.pushEnabled ?? true,
  });
}

const schema = z.object({
  dailyDigest: z.boolean().optional(),
  criticalAlerts: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
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
