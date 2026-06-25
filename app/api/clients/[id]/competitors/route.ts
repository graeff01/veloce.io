import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

const TIERS = ["serio", "medio", "amador"];

// extrai o page_id de um link da Ad Library / página do FB (pro logo público)
function extractPageId(url: string): string | null {
  return url.match(/(?:view_all_page_id|page_id|[?&]id)=(\d{5,})/)?.[1] ?? url.match(/facebook\.com\/[^/?#]*-(\d{5,})/)?.[1] ?? null;
}

// GET → players do nicho (com contagem de vencedores salvos).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const competitors = await prisma.competitor.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { winners: true } } },
  });
  return NextResponse.json({ competitors });
}

// POST → cria player { name, tier?, adLibraryUrl? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome do concorrente é obrigatório." }, { status: 400 });
  const adLibraryUrl = String(body.adLibraryUrl ?? "").trim() || null;
  const pageId = String(body.pageId ?? "").trim() || (adLibraryUrl ? extractPageId(adLibraryUrl) : null);
  const competitor = await prisma.competitor.create({
    data: {
      clientId: id,
      name,
      tier: TIERS.includes(body.tier) ? body.tier : null,
      adLibraryUrl,
      pageId,
    },
  });
  return NextResponse.json({ competitor });
}
