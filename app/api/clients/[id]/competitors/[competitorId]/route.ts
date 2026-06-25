import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

const TIERS = ["serio", "medio", "amador"];

// PATCH → { name?, tier?, adLibraryUrl? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; competitorId: string }> }) {
  const { id, competitorId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; tier?: string | null; adLibraryUrl?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.tier === "string" || body.tier === null) data.tier = TIERS.includes(body.tier) ? body.tier : null;
  if (typeof body.adLibraryUrl === "string") data.adLibraryUrl = body.adLibraryUrl.trim() || null;

  const res = await prisma.competitor.updateMany({ where: { id: competitorId, clientId: id }, data });
  if (res.count === 0) return NextResponse.json({ error: "Concorrente não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; competitorId: string }> }) {
  const { id, competitorId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  await prisma.competitor.deleteMany({ where: { id: competitorId, clientId: id } });
  return NextResponse.json({ ok: true });
}
