import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — Consumo do mês: atendimentos (contatos distintos que escreveram no mês) vs o limite
// do plano, excedente + custo, projeção no ritmo atual, e a série diária pro gráfico.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Passa pelo GATE do portal, como as demais rotas. Antes decidia a autorização
  // por conta própria e ficava fora da checagem de seção: uma atendente sem a
  // seção "consumo" lia o limite do plano, o excedente e o CUSTO do cliente.
  // Encontrado testando com o acesso real de uma vendedora da JR.
  const { error, portal } = await guardPortal(req, token, { section: "consumo" });
  if (error) return error;

  const conns = await prisma.waConnection.findMany({ where: { clientId: portal.clientId }, select: { id: true } });
  const connIds = conns.map((c) => c.id);
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { monthlyLeadLimit: true, excessRatePerLead: true } });
  const limit = cfg?.monthlyLeadLimit ?? null;
  const rate = cfg?.excessRatePerLead ?? null;

  // Início do mês no fuso BRT (UTC-3): 00:00 BRT = 03:00 UTC.
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  const y = brt.getUTCFullYear(), mon = brt.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, mon, 1, 3, 0, 0));
  const dayOfMonth = brt.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, mon + 1, 0)).getUTCDate();

  if (!connIds.length) {
    return NextResponse.json({ count: 0, limit, rate, excess: 0, excessCost: 0, projection: 0, daysInMonth, dayOfMonth, daily: [], month: monthStart.toISOString() });
  }

  const idList = Prisma.join(connIds);
  // Atendimentos = contatos DISTINTOS que enviaram mensagem (inbound) no mês.
  const countRows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT "contactId")::bigint AS n FROM "WaMessage"
    WHERE "connectionId" IN (${idList}) AND direction = 'in' AND "timestamp" >= ${monthStart}`;
  const count = Number(countRows[0]?.n ?? 0);

  // Série diária (contatos distintos por dia, no fuso BRT) pro gráfico.
  const dailyRows = await prisma.$queryRaw<{ d: Date; n: bigint }[]>`
    SELECT date_trunc('day', "timestamp" AT TIME ZONE 'America/Sao_Paulo') AS d, COUNT(DISTINCT "contactId")::bigint AS n
    FROM "WaMessage"
    WHERE "connectionId" IN (${idList}) AND direction = 'in' AND "timestamp" >= ${monthStart}
    GROUP BY 1 ORDER BY 1`;
  const daily = dailyRows.map((r) => ({ day: new Date(r.d).getUTCDate(), count: Number(r.n) }));

  const excess = limit != null ? Math.max(0, count - limit) : 0;
  const excessCost = rate != null ? Math.round(excess * rate * 100) / 100 : 0;
  const projection = dayOfMonth > 0 ? Math.round((count / dayOfMonth) * daysInMonth) : count;

  return NextResponse.json({ count, limit, rate, excess, excessCost, projection, daysInMonth, dayOfMonth, daily, month: monthStart.toISOString() });
}
