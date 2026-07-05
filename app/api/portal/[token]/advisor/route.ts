import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { normalizePeriod } from "@/lib/notifications/client-report";
import { buildAdvisor, answerAdvisorQuestion } from "@/lib/notifications/client-advisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consultor Veloce — GET: as 6 perguntas fixas (determinístico, zero custo).
// Escopado pelo token do portal.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse(null, { status: 404 });
  const period = normalizePeriod(new URL(req.url).searchParams.get("p"));
  return NextResponse.json(await buildAdvisor(portal.clientId, period));
}

// POST: pergunta LIVRE do dono → resposta com IA ancorada nos números reais dele.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse(null, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { pergunta?: unknown; p?: unknown };
  const pergunta = typeof body.pergunta === "string" ? body.pergunta : "";
  const period = normalizePeriod(typeof body.p === "string" ? body.p : null);
  return NextResponse.json(await answerAdvisorQuestion(portal.clientId, period, pergunta));
}
