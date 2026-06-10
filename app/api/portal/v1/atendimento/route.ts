import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;
  const { session } = auth;

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const waConn = await prisma.waConnection.findUnique({
    where: { clientId: session.clientId },
  });

  const convs = await prisma.waConversation.findMany({
    where: {
      connectionId: waConn?.id ?? "",
      firstInboundAt: { gte: d30 },
    },
    select: {
      id: true,
      firstResponseSec: true,
      firstInboundAt: true,
    },
  });

  const total = convs.length;
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const pendentes = total - respondidos;
  const taxaResposta = total > 0 ? (respondidos / total) * 100 : 0;

  const times = convs
    .filter((c): c is typeof c & { firstResponseSec: number } => c.firstResponseSec != null)
    .map((c) => c.firstResponseSec);
  const avgSec = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  // Distribuição por faixa de tempo
  function faixa(sec: number): "ate5m" | "ate30m" | "ate1h" | "mais1h" {
    if (sec <= 300) return "ate5m";
    if (sec <= 1800) return "ate30m";
    if (sec <= 3600) return "ate1h";
    return "mais1h";
  }
  const dist = { ate5m: 0, ate30m: 0, ate1h: 0, mais1h: 0 };
  for (const t of times) dist[faixa(t)]++;

  // Série 7 dias
  const series: Record<string, { respondidos: number; total: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    series[d.toISOString().slice(0, 10)] = { respondidos: 0, total: 0 };
  }
  for (const c of convs) {
    if (!c.firstInboundAt) continue;
    const k = c.firstInboundAt.toISOString().slice(0, 10);
    if (!(k in series)) continue;
    series[k].total++;
    if (c.firstResponseSec != null) series[k].respondidos++;
  }

  await logPortalAccess(session.clientId, session.credentialId, "VIEW_ATENDIMENTO", req);

  return NextResponse.json({
    kpis: {
      total,
      respondidos,
      pendentes,
      taxaResposta: parseFloat(taxaResposta.toFixed(1)),
      avgResponseMin: Math.round(avgSec / 60),
    },
    distribuicao: dist,
    series: Object.entries(series).map(([date, v]) => ({ date, ...v })),
  });
}
