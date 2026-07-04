import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET — estado do bot do cliente: conexão, flags de alerta, quiet hours, destinatários.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const [bot, recipients] = await Promise.all([
    prisma.clientBot.findUnique({ where: { clientId: id } }),
    prisma.clientBotRecipient.findMany({ where: { clientId: id, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, username: true, role: true, channel: true, waId: true, createdAt: true } }),
  ]);

  return NextResponse.json({
    connected: !!bot?.active,
    username: bot?.username ?? null,
    brandName: bot?.brandName ?? null,
    welcomeMessage: bot?.welcomeMessage ?? null,
    excludedNames: bot?.excludedNames ?? null,
    alerts: bot
      ? { novoLead: bot.novoLead, slaAlerts: bot.slaAlerts, leadQuente: bot.leadQuente, leadEsfriando: bot.leadEsfriando, resumoDiario: bot.resumoDiario }
      : { novoLead: true, slaAlerts: true, leadQuente: true, leadEsfriando: true, resumoDiario: true },
    quietStart: bot?.quietStart ?? null,
    quietEnd: bot?.quietEnd ?? null,
    lastAlertAt: bot?.lastAlertAt ?? null,
    recipients,
  });
}

// PUT — conecta/atualiza o bot (token+username) e/ou salva alertas/quiet hours.
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));

  // Atualizar flags de alerta / quiet hours / marca branca (só se o bot existir).
  const data: Record<string, unknown> = {};
  for (const k of ["novoLead", "slaAlerts", "leadQuente", "leadEsfriando", "resumoDiario"] as const) {
    if (typeof body[k] === "boolean") data[k] = body[k];
  }
  if ("quietStart" in body) data.quietStart = body.quietStart || null;
  if ("quietEnd" in body) data.quietEnd = body.quietEnd || null;
  if ("brandName" in body) data.brandName = (body.brandName as string)?.trim() || null;
  if ("welcomeMessage" in body) data.welcomeMessage = (body.welcomeMessage as string)?.trim() || null;
  if ("excludedNames" in body) data.excludedNames = (body.excludedNames as string)?.trim() || null;
  if (Object.keys(data).length > 0) {
    await prisma.clientBot.updateMany({ where: { clientId: id }, data });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — desconecta o bot (mantém destinatários; só desativa o envio).
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  await prisma.clientBot.updateMany({ where: { clientId: id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
