import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

const FORMATS = ["imagem", "carrossel", "video", "reels"];
const ANGLES = ["preco", "entrada", "urgencia", "prova_social", "autoridade", "novidade", "comparacao", "garantia"];

// GET → criativos vencedores salvos (swipe), com o player vinculado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const winners = await prisma.winningCreative.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    include: { competitor: { select: { id: true, name: true, tier: true } } },
  });
  return NextResponse.json({ winners });
}

// POST → salva vencedor { adLibraryUrl, format, angle, offer?, note?, liveSince?, competitorId? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));

  const adLibraryUrl = String(body.adLibraryUrl ?? "").trim() || null;
  const adId = String(body.adId ?? "").trim() || null;
  if (!adLibraryUrl && !adId) return NextResponse.json({ error: "Escolha um anúncio ou cole o link da Ad Library." }, { status: 400 });
  if (!FORMATS.includes(body.format)) return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  if (!ANGLES.includes(body.angle)) return NextResponse.json({ error: "Ângulo inválido." }, { status: 400 });

  let liveSince: Date | null = null;
  if (typeof body.liveSince === "string" && body.liveSince) {
    const d = new Date(`${body.liveSince}T12:00:00.000Z`);
    if (!isNaN(d.getTime())) liveSince = d;
  }

  // só vincula player que é do próprio cliente
  let competitorId: string | null = null;
  if (typeof body.competitorId === "string" && body.competitorId) {
    const c = await prisma.competitor.findFirst({ where: { id: body.competitorId, clientId: id }, select: { id: true } });
    competitorId = c?.id ?? null;
  }

  const winner = await prisma.winningCreative.create({
    data: {
      clientId: id, competitorId, adLibraryUrl, adId,
      thumbnailUrl: String(body.thumbnailUrl ?? "").trim() || null,
      adName: String(body.adName ?? "").trim() || null,
      format: body.format, angle: body.angle,
      offer: String(body.offer ?? "").trim() || null,
      note: String(body.note ?? "").trim() || null,
      liveSince,
    },
  });
  return NextResponse.json({ winner });
}
