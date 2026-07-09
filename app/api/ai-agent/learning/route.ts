import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { learnFromOutcomes } from "@/lib/ai-agent/learning";

// L3: qual abordagem (variante) converte, cruzando com o desfecho real. Read-only.
export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 180);

  const report = await learnFromOutcomes(clientId, days);
  return NextResponse.json(report);
}
