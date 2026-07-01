import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { normalizePeriod } from "@/lib/notifications/client-report";
import { buildAdvisor } from "@/lib/notifications/client-advisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consultor Veloce — respostas determinísticas dos números reais do cliente.
// Escopado pelo token do portal. Sem LLM (zero custo).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse(null, { status: 404 });
  const period = normalizePeriod(new URL(req.url).searchParams.get("p"));
  return NextResponse.json(await buildAdvisor(portal.clientId, period));
}
