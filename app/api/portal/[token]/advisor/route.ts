import { NextResponse } from "next/server";
import { normalizePeriod } from "@/lib/notifications/client-report";
import { buildAdvisor, answerAdvisorQuestion } from "@/lib/notifications/client-advisor";
import { guardPortal } from "@/lib/portal-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consultor Veloce — GET: as 6 perguntas fixas (determinístico, zero custo).
// Escopado pelo token do portal + sessão (quando o painel exige login).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "painel" });
  if (error) return error;
  const period = normalizePeriod(new URL(req.url).searchParams.get("p"));
  return NextResponse.json(await buildAdvisor(portal.clientId, period));
}

// POST: pergunta LIVRE do dono → resposta com IA ancorada nos números reais dele.
// Rota que GASTA MODELO: cota reduzida (cost: "llm") — antes era ilimitada e sem login.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "painel", cost: "llm" });
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { pergunta?: unknown; p?: unknown };
  const pergunta = typeof body.pergunta === "string" ? body.pergunta : "";
  const period = normalizePeriod(typeof body.p === "string" ? body.p : null);
  return NextResponse.json(await answerAdvisorQuestion(portal.clientId, period, pergunta));
}
