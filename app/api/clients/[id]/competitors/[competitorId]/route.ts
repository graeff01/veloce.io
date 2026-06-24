import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// PATCH  /api/clients/[id]/competitors/[competitorId]  → { name?, pageId?, notes?, region? }
// DELETE /api/clients/[id]/competitors/[competitorId]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; competitorId: string }> }) {
  const { id, competitorId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; pageId?: string | null; notes?: string | null; region?: string; tier?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.pageId === "string") data.pageId = body.pageId.trim() || null;
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (typeof body.region === "string" && body.region.trim()) data.region = body.region.trim().toUpperCase().slice(0, 2);
  if (typeof body.tier === "string") data.tier = ["serio", "medio", "amador"].includes(body.tier) ? body.tier : null;

  const res = await prisma.competitor.updateMany({ where: { id: competitorId, clientId: id }, data });
  if (res.count === 0) return NextResponse.json({ error: "Concorrente não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; competitorId: string }> }) {
  const { id, competitorId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  await prisma.competitor.deleteMany({ where: { id: competitorId, clientId: id } });
  return NextResponse.json({ ok: true });
}
