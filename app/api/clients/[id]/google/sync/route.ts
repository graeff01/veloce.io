import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { syncGoogleAds } from "@/lib/google-ads/sync";

// POST — sincroniza o período pedido (YYYY-MM-DD). Enquanto faltar credencial/OAuth,
// syncGoogleAds lança um erro claro que a tela exibe.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const since = typeof body?.since === "string" ? body.since : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const until = typeof body?.until === "string" ? body.until : new Date().toISOString().slice(0, 10);

  try {
    await syncGoogleAds(id, since, until);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao sincronizar" }, { status: 400 });
  }
}
