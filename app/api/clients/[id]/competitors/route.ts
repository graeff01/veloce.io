import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET  /api/clients/[id]/competitors        → lista
// POST /api/clients/[id]/competitors        → cria { name, pageId?, region? }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const competitors = await prisma.competitor.findMany({ where: { clientId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ competitors });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome do concorrente é obrigatório." }, { status: 400 });
  const competitor = await prisma.competitor.create({
    data: {
      clientId: id,
      name,
      pageId: String(body.pageId ?? "").trim() || null,
      region: (String(body.region ?? "").trim().toUpperCase() || "BR").slice(0, 2),
      notes: String(body.notes ?? "").trim() || null,
    },
  });
  return NextResponse.json({ competitor });
}
