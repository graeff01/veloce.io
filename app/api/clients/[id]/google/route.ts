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
    include: {
      campaigns: { orderBy: { spend: "desc" } },
      searchTerms: { orderBy: { spend: "desc" }, take: 50 },
      keywords: { orderBy: { spend: "desc" }, take: 50 },
      insights: { orderBy: { date: "asc" } },
    },
  });

  if (!conn) return NextResponse.json({ connected: false, configured: isGoogleAdsConfigured() });

  const t = conn.campaigns.reduce(
    (a, c) => ({ spend: a.spend + c.spend, impressions: a.impressions + c.impressions, clicks: a.clicks + c.clicks, conversions: a.conversions + c.conversions }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  // Parcela de impressões agregada: média ponderada por impressões das campanhas que têm o dado.
  const withIs = conn.campaigns.filter((c) => c.impressionShare != null && c.impressions > 0);
  const wImp = withIs.reduce((s, c) => s + c.impressions, 0);
  const wAvg = (sel: (c: typeof withIs[number]) => number | null | undefined) =>
    wImp > 0 ? withIs.reduce((s, c) => s + (sel(c) ?? 0) * c.impressions, 0) / wImp : null;
  const impressionShare = withIs.length
    ? { share: wAvg((c) => c.impressionShare), lostBudget: wAvg((c) => c.lostBudget), lostRank: wAvg((c) => c.lostRank) }
    : null;

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
    impressionShare,
    campaigns: conn.campaigns.map((c) => ({
      campaignId: c.campaignId, name: c.name, status: c.status,
      spend: c.spend, impressions: c.impressions, clicks: c.clicks, conversions: c.conversions,
      impressionShare: c.impressionShare, lostBudget: c.lostBudget, lostRank: c.lostRank,
    })),
    searchTerms: conn.searchTerms.map((s) => ({ term: s.term, spend: s.spend, clicks: s.clicks, conversions: s.conversions })),
    keywords: conn.keywords.map((k) => ({ keyword: k.keyword, matchType: k.matchType, qualityScore: k.qualityScore, spend: k.spend, clicks: k.clicks, conversions: k.conversions })),
    series: conn.insights.map((i) => ({ date: i.date.toISOString().slice(0, 10), spend: i.spend, conversions: i.conversions })),
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
