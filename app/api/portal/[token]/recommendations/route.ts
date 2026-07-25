import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Centro de Evolução (Camada de Inteligência): recomendações baseadas em evidência +
// resumo das avaliações de conversa. Observacional — a aprovação é humana; nada é
// aplicado automaticamente na IA.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const clientId = portal.clientId;

  const [recos, evals] = await Promise.all([
    prisma.learningRecommendation.findMany({
      where: { clientId },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
    prisma.conversationEvaluation.findMany({
      where: { clientId, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
      orderBy: { overall: "asc" }, take: 500,
      select: { contactId: true, overall: true, confidence: true, dimensions: true, turnCount: true, createdAt: true },
    }),
  ]);

  // Ordena recomendações: PENDENTES primeiro, por prioridade = impacto(rate) × confiança.
  const rank = (s: string) => (s === "pendente" ? 0 : s === "adiada" ? 1 : 2);
  recos.sort((a, b) => rank(a.status) - rank(b.status) || b.rate * b.confidence - a.rate * a.confidence);

  // Resumo das avaliações: média geral + média por dimensão + piores conversas.
  const dimSum = new Map<string, { sum: number; n: number }>();
  let overallSum = 0;
  for (const e of evals) {
    overallSum += e.overall;
    const dims = (e.dimensions ?? {}) as Record<string, { score?: number | null }>;
    for (const [k, d] of Object.entries(dims)) {
      if (d?.score == null) continue;
      const cur = dimSum.get(k) ?? { sum: 0, n: 0 };
      cur.sum += d.score; cur.n += 1; dimSum.set(k, cur);
    }
  }
  const dimensions = [...dimSum.entries()].map(([dimension, v]) => ({ dimension, avg: Math.round((v.sum / v.n) * 100) / 100, n: v.n })).sort((a, b) => a.avg - b.avg);
  const evaluations = {
    total: evals.length,
    avgOverall: evals.length ? Math.round((overallSum / evals.length) * 100) / 100 : null,
    dimensions,
    worst: evals.slice(0, 8).map((e) => ({ contactId: e.contactId, overall: e.overall, confidence: e.confidence, turnCount: e.turnCount })),
  };

  const pending = recos.filter((r) => r.status === "pendente").length;
  return NextResponse.json({ recommendations: recos, evaluations, pending });
}

const ACTIONS: Record<string, string> = { aprovar: "aprovada", rejeitar: "rejeitada", adiar: "adiada", promover: "promovida" };

// Ação humana numa recomendação (aprovar/rejeitar/adiar/promover). Nada é aplicado na IA
// automaticamente — a mudança de conhecimento/playbook é feita pelo humano; aqui só o status.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const email = (await isProtected(portal.clientId)) ? await getPortalSessionEmail(portal.clientId) : null;
  if ((await isProtected(portal.clientId)) && !email) return NextResponse.json({ error: "Faça login." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const status = ACTIONS[String(body?.action ?? "")];
  if (!id || !status) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  const reco = await prisma.learningRecommendation.findFirst({ where: { id, clientId: portal.clientId }, select: { id: true } });
  if (!reco) return NextResponse.json({ error: "Recomendação não encontrada." }, { status: 404 });

  await prisma.learningRecommendation.update({
    where: { id },
    data: {
      status,
      approvedByEmail: status === "aprovada" || status === "promovida" ? email : undefined,
      rejectionReason: status === "rejeitada" ? String(body?.reason ?? "").slice(0, 500) || null : undefined,
    },
  });
  return NextResponse.json({ ok: true, status });
}
