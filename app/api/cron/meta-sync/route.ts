import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncMetaAds, MetaTokenError, MetaRateLimitError } from "@/lib/meta-sync";

// Cron diário de sincronização Meta (estrutura + insights por ad_id).
// Re-sincroniza os ÚLTIMOS 3 DIAS porque o spend da Meta só finaliza em ~72h.
//
// Proteção: header `authorization: Bearer <CRON_SECRET>` ou `x-cron-secret`.
// Aponte qualquer agendador (Railway cron, GitHub Actions, cron-job.org) aqui.
//   curl -X POST https://<app>/api/cron/meta-sync -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado no ambiente." }, { status: 503 });
  }
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // Janela: últimos 3 dias (hoje inclusive)
  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const since = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2));
  const until = fmt(now);

  const conns = await prisma.metaConnection.findMany({ select: { id: true, clientId: true } });

  const results: { clientId: string; ok: boolean; error?: string; ads?: number; insightDays?: number }[] = [];
  for (const c of conns) {
    try {
      const r = await syncMetaAds(c.id, since, until);
      results.push({ clientId: c.clientId, ok: true, ads: r.ads, insightDays: r.insightDays });
    } catch (e) {
      // Um token ruim não pode derrubar o sync dos demais clientes
      const error =
        e instanceof MetaTokenError ? "token expirado/revogado" :
        e instanceof MetaRateLimitError ? "rate limit" :
        e instanceof Error ? e.message : "erro";
      results.push({ clientId: c.clientId, ok: false, error });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({ ran: results.length, ok, failed: results.length - ok, period: { since, until }, results });
}
