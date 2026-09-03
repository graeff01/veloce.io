import { NextResponse } from "next/server";
import { guardPortal } from "@/lib/portal-guard";
import { getClientAds } from "@/lib/notifications/client-ads";
import { normalizePeriod } from "@/lib/notifications/client-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — desempenho de mídia para o módulo Anúncios do APP.
//
// ADITIVO: rota nova, ninguém consumia este caminho antes. A tela
// /r/<token>/anuncios do PWA continua calculando no RSC e NÃO passa por aqui —
// nada muda para o portal. As duas chamam a MESMA função (`getClientAds`), então
// os números não podem divergir entre web e app.
//
// Escopo: `guardPortal` com a seção "anuncios" — mesmo gate das demais rotas.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "anuncios" });
  if (error) return error;

  const p = new URL(req.url).searchParams.get("p");
  return NextResponse.json(await getClientAds(portal.clientId, normalizePeriod(p)));
}
