import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { buildImpact } from "@/lib/ai-agent/impact";

// Painel de Impacto / ROI da IA por cliente — prova de valor pro dono da loja (#3).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days") || 30)));
  return NextResponse.json(await buildImpact(id, days));
}
