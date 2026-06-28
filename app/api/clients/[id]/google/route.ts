import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { isGoogleAdsConfigured } from "@/lib/google-ads/config";
import { z } from "zod";

const connectSchema = z.object({
  customerId: z.string().min(1).transform((v) => v.replace(/\D/g, "")), // só dígitos
  loginCustomerId: z.string().optional().transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  accountName: z.string().optional(),
});

// GET — estado da conexão + campanhas (vazio até o 1º sync)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.googleConnection.findUnique({
    where: { clientId: id },
    include: { campaigns: { orderBy: { spend: "desc" } } },
  });

  if (!conn) return NextResponse.json({ connected: false, configured: isGoogleAdsConfigured() });

  const t = conn.campaigns.reduce(
    (a, c) => ({ spend: a.spend + c.spend, impressions: a.impressions + c.impressions, clicks: a.clicks + c.clicks, conversions: a.conversions + c.conversions }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  return NextResponse.json({
    connected: true,
    configured: isGoogleAdsConfigured(),
    oauthDone: Boolean(conn.refreshToken),
    customerId: conn.customerId,
    loginCustomerId: conn.loginCustomerId,
    accountName: conn.accountName,
    currency: conn.currency,
    lastSyncAt: conn.lastSyncAt,
    totals: t,
    campaigns: conn.campaigns.map((c) => ({
      campaignId: c.campaignId, name: c.name, status: c.status,
      spend: c.spend, impressions: c.impressions, clicks: c.clicks, conversions: c.conversions,
    })),
  });
}

// POST — conectar/atualizar a conta (customerId). O OAuth (refreshToken) é concluído
// depois, quando as credenciais existirem.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = connectSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });

  const conn = await prisma.googleConnection.upsert({
    where: { clientId: id },
    create: { clientId: id, customerId: parsed.data.customerId, loginCustomerId: parsed.data.loginCustomerId || null, accountName: parsed.data.accountName || null },
    update: { customerId: parsed.data.customerId, loginCustomerId: parsed.data.loginCustomerId || null, accountName: parsed.data.accountName || null },
  });

  await logAction(session!.user.id, "UPDATE_CLIENT", id, undefined, { google: "connect", customerId: conn.customerId });
  return NextResponse.json({ ok: true });
}

// DELETE — desconectar
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  await prisma.googleConnection.deleteMany({ where: { clientId: id } });
  await logAction(session!.user.id, "UPDATE_CLIENT", id, undefined, { google: "disconnect" });
  return NextResponse.json({ ok: true });
}
