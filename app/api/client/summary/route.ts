import { NextResponse } from "next/server";
import { requireClientAuth } from "@/lib/api-helpers";
import { computeClientSummary } from "@/lib/client-portal";

// GET /api/client/summary?year=&month=  → resumo executivo + ads (cliente logado)
export async function GET(req: Request) {
  const { error, clientId } = await requireClientAuth();
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;

  const data = await computeClientSummary(clientId, year, month);
  if (!data) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  return NextResponse.json(data);
}
