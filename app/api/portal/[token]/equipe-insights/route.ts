import { NextResponse } from "next/server";
import { guardPortal } from "@/lib/portal-guard";
import { calcularInsightsEquipe } from "@/lib/portal/equipe-insights";

export const runtime = "nodejs";

// GET — o diagnóstico da equipe: tempo, fila e o que está travado.
// As regras vivem em lib/portal/equipe-insights.ts, compartilhadas com os
// alertas — a tela e o aviso não podem discordar.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "equipe" });
  if (error) return error;

  const p = new URL(req.url).searchParams.get("p");
  return NextResponse.json(await calcularInsightsEquipe(portal.clientId, p));
}
