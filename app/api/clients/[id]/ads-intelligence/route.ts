import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { computeAdsIntelligence } from "@/lib/ads-intelligence";

// GET /api/clients/[id]/ads-intelligence?year=&month=
// Inteligência comercial da mídia: investimento (Meta, por ad_id) × comportamento
// real do lead (WhatsApp/CRM). 100% por ID. Sem mock.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const data = await computeAdsIntelligence(id, start, end);
  return NextResponse.json(data);
}
