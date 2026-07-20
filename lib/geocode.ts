import { prismaUnscoped } from "@/lib/prisma";

// Geocoding REVERSO (coordenada → cidade/bairro) via Nominatim/OpenStreetMap (sem chave/
// custo). Usado quando o cliente COMPARTILHA A LOCALIZAÇÃO no WhatsApp: a partir do ponto,
// descobrimos o bairro e a cidade para o motor resolver a ZONA do frete (bairro→zona).
// Cache global por coordenada arredondada (~11 m) — não martela o Nominatim (ToS: 1 req/s).
export interface RevGeo { city: string | null; suburb: string | null }

const pick = (o: Record<string, string> | undefined, keys: string[]): string | null => {
  for (const k of keys) { const v = o?.[k]; if (v && v.trim()) return v.trim(); }
  return null;
};

// Geocoding DIRETO (endereço → coordenada) — usado p/ mandar o PIN da loja no mapa.
// Cache global por texto do endereço (não re-geocodifica nem martela o Nominatim).
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = (query || "").trim();
  if (!q) return null;
  const key = `fwd|${q.toLowerCase().replace(/\s+/g, " ")}`;
  const cached = await prismaUnscoped.geocodeCache.findUnique({ where: { key } }).catch(() => null);
  if (cached) return { lat: cached.lat, lng: cached.lng };
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "veloce-frete/1.0 (contato@velocebm.com)", "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const arr = (await r.json()) as { lat: string; lon: string }[];
    if (!arr.length) return null;
    const lat = Number(arr[0].lat), lng = Number(arr[0].lon);
    await prismaUnscoped.geocodeCache.upsert({ where: { key }, create: { key, lat, lng }, update: { lat, lng } }).catch(() => {});
    return { lat, lng };
  } catch { return null; }
}

export async function reverseGeocode(lat: number, lng: number): Promise<RevGeo> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { city: null, suburb: null };
  const key = `rev|${lat.toFixed(4)}|${lng.toFixed(4)}`;
  const cached = await prismaUnscoped.geocodeCache.findUnique({ where: { key } }).catch(() => null);
  if (cached?.label) { try { return JSON.parse(cached.label) as RevGeo; } catch { /* cache corrompido: refaz */ } }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${lat}&lon=${lng}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "veloce-frete/1.0 (contato@velocebm.com)", "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { city: null, suburb: null };
    const j = (await r.json()) as { address?: Record<string, string> };
    const a = j.address;
    const out: RevGeo = {
      city: pick(a, ["city", "town", "municipality", "village", "city_district"]),
      suburb: pick(a, ["suburb", "neighbourhood", "quarter", "city_district", "residential"]),
    };
    await prismaUnscoped.geocodeCache.upsert({ where: { key }, create: { key, lat, lng, label: JSON.stringify(out) }, update: { label: JSON.stringify(out) } }).catch(() => {});
    return out;
  } catch {
    return { city: null, suburb: null };
  }
}
