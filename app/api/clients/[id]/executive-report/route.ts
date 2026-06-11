import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { renderToBuffer } from "@react-pdf/renderer";
import { computeExecutiveReport } from "@/lib/executive-report";
import { buildExecutiveReport } from "@/components/clients/executive-report-document";

export const runtime = "nodejs";

// GET /api/clients/[id]/executive-report?year=&month=  → PDF executivo mensal
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;

  const data = await computeExecutiveReport(id, year, month);
  if (!data) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const buffer = await renderToBuffer(buildExecutiveReport(data));
  const slug = data.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fileName = `relatorio-executivo-${slug}-${year}-${String(month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
