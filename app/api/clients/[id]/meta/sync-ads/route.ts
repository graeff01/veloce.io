import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { syncMetaAds, MetaTokenError, MetaRateLimitError } from "@/lib/meta-sync";

// POST — sincroniza estrutura (campanhas/conjuntos/anúncios/criativos) + insights
// diários em nível de anúncio, tudo por ID oficial. Base da atribuição real.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const conn = await prisma.metaConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Meta não configurada" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const since = body.since ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const until = body.until ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  try {
    const result = await syncMetaAds(conn.id, since, until);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof MetaTokenError) {
      return NextResponse.json({ error: "O token do Meta expirou ou foi revogado. Reconecte a conta.", reconnect: true }, { status: 401 });
    }
    if (e instanceof MetaRateLimitError) {
      return NextResponse.json({ error: "Limite de requisições da Meta atingido. Tente novamente em alguns minutos.", retry: true }, { status: 429 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao sincronizar" }, { status: 400 });
  }
}
