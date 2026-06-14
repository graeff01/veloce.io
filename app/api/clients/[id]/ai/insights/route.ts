import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { buildLeadInsights } from "@/lib/ai-agent/insights";

// Insights comerciais agregados (intents/sentiment/objeções) por cliente — Sprint 3.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days") || 30)));
  return NextResponse.json(await buildLeadInsights(id, days));
}
