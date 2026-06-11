import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";
import { computeOverview } from "@/lib/wa-metrics";
import { computeRealAttribution } from "@/lib/meta-attribution";
import { cacheGet, cacheSet } from "@/lib/ttl-cache";

// Resumo executivo do portal.
//
// FONTE ÚNICA DE VERDADE: usa exatamente o mesmo computeOverview() que alimenta
// a Central de Operação WhatsApp da área administrativa. Mesma definição de
// "lead" (conversas ao vivo + leads de anúncio importados sem conversa), mesmo
// cálculo de resposta/funil/origem. A janela é o MÊS CORRENTE — idêntica à
// auditoria mensal interna — para que os números do cliente batam com os que a
// equipe reporta. Sem isso, "31 no portal vs 47 no admin" quebra a confiança.
export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;
  const { session } = auth;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Período anterior (mês passado) para o comparativo de tendência
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = start;

  const [client, conn, metaConn] = await Promise.all([
    prisma.client.findUnique({ where: { id: session.clientId }, select: { name: true } }),
    prisma.waConnection.findUnique({ where: { clientId: session.clientId } }),
    prisma.metaConnection.findUnique({ where: { clientId: session.clientId }, select: { id: true } }),
  ]);

  const monthLabel = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  await logPortalAccess(session.clientId, session.credentialId, "VIEW_RESUMO", req);

  // Cache curto por cliente (dados são iguais p/ todas as credenciais do mesmo
  // cliente). Alivia recomputo quando várias pessoas abrem o portal junto.
  const cacheKey = `resumo:${session.clientId}`;
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return NextResponse.json(cached);

  if (!conn) {
    return NextResponse.json({
      clientName: client?.name ?? "",
      monthLabel,
      updatedAt: null,
      connected: false,
      leads: 0, leadsPrev: 0, convertidoPrev: 0, responded: 0, semResposta: 0, responseRate: 0,
      avgFirstResponseSec: null, fastestResponseSec: null, mensagensRecebidas: 0,
      negociacao: 0, convertido: 0,
      investimento: 0, cplReal: null,
      origem: { anuncio: 0, organico: 0 },
      topAds: [], series: [],
    });
  }

  // Overview (operação/atendimento) + período anterior + Atribuição real por ID.
  const [ov, ovPrev, attr] = await Promise.all([
    computeOverview(conn.id, start, end),
    computeOverview(conn.id, prevStart, prevEnd),
    metaConn
      ? computeRealAttribution(metaConn.id, conn.id, start, end)
      : Promise.resolve(null),
  ]);

  const payload = {
    clientName: client?.name ?? "",
    monthLabel,
    updatedAt: conn.lastEventAt?.toISOString() ?? null,
    connected: true,
    leads: ov.leads,
    leadsPrev: ovPrev.leads, // mês anterior — comparativo de tendência
    convertidoPrev: ovPrev.funnel.convertido,
    responded: ov.responded,
    semResposta: ov.leads - ov.responded,
    responseRate: ov.responseRate, // 0..1
    avgFirstResponseSec: ov.avgFirstResponseSec,
    fastestResponseSec: ov.responseMinSec,
    mensagensRecebidas: ov.messagesReceived,
    negociacao: ov.funnel.negociacao,
    convertido: ov.funnel.convertido,
    // ── Atribuição REAL por ad_id (investimento e CPL real). Sem match por nome. ──
    investimento: attr?.investimento ?? 0,
    cplReal: attr?.cplReal ?? null,
    origem: { anuncio: ov.byOrigin.ad, organico: ov.byOrigin.organic },
    // Anúncios que mais trouxeram contatos (nome canônico, fonte WhatsApp)
    topAds: ov.byAd.slice(0, 4).map((a) => ({ title: a.adTitle, total: a.total })),
    series: ov.series, // [{ date, leads }] — apenas dias com lead
  };

  cacheSet(cacheKey, payload, 60_000); // 60s
  return NextResponse.json(payload);
}
