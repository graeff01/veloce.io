import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Geocodifica um BAIRRO (Nominatim/OpenStreetMap, sem chave/custo) p/ posicionar o pin
// no mapa. Uso ADMIN, ocasional — dentro do portal, escopado por token. Server-side p/
// mandar o User-Agent que o ToS exige e não expor nada. Enviesa pela cidade + RS/Brasil.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const city = (url.searchParams.get("city") || "").trim();
  if (!q) return NextResponse.json({ found: false });

  // Cache global (entre clientes) — não re-geocodifica o mesmo bairro nem martela o Nominatim.
  const key = `${norm(q)}|${norm(city)}`;
  const cached = await prismaUnscoped.geocodeCache.findUnique({ where: { key } }).catch(() => null);
  if (cached) return NextResponse.json({ found: true, lat: cached.lat, lng: cached.lng, cached: true });

  const query = [q, city, "Rio Grande do Sul", "Brasil"].filter(Boolean).join(", ");
  const nomi = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(nomi, { headers: { "User-Agent": "veloce-frete/1.0 (contato@velocebm.com)", "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return NextResponse.json({ found: false });
    const arr = (await r.json()) as { lat: string; lon: string }[];
    if (!arr.length) return NextResponse.json({ found: false });
    const lat = Number(arr[0].lat), lng = Number(arr[0].lon);
    await prismaUnscoped.geocodeCache.upsert({ where: { key }, create: { key, lat, lng }, update: { lat, lng } }).catch(() => {});
    return NextResponse.json({ found: true, lat, lng });
  } catch {
    return NextResponse.json({ found: false });
  }
}
