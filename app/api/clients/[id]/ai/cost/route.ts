import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { costBreakdown } from "@/lib/ai-agent/usage";

// Cost monitor por cliente (hoje/7d/30d + por pipeline + custo por lead) — Sprint 5.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  return NextResponse.json(await costBreakdown(id));
}
