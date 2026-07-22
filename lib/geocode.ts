import { prismaUnscoped } from "@/lib/prisma";

// Geocoding via LocationIQ (com chave — robusto em datacenter/Railway) com FALLBACK
// para o Nominatim/OpenStreetMap (grátis, sem chave, mas limita datacenter). Usado quando
// o cliente COMPARTILHA A LOCALIZAÇÃO no WhatsApp: do ponto, descobrimos bairro e cidade
// para o motor resolver a ZONA do frete (bairro→zona). Cache global por coordenada
// arredondada (~11 m) — não martela o provedor.
export interface RevGeo { city: string | null; suburb: string | null }

const LOCATIONIQ_TOKEN = process.env.LOCATIONIQ_TOKEN;
const GEO_HEADERS = { "User-Agent": "veloce-frete/1.0 (contato@velocebm.com)", "Accept-Language": "pt-BR" };

const pick = (o: Record<string, string> | undefined, keys: string[]): string | null => {
  for (const k of keys) { const v = o?.[k]; if (v && v.trim()) return v.trim(); }
  return null;
};

// Geocoding DIRETO (endereço → coordenada) — usado p/ mandar o PIN da loja no mapa.
// Cache global por texto do endereço (não re-geocodifica nem martela o provedor).
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = (query || "").trim();
  if (!q) return null;
  const key = `fwd|${q.toLowerCase().replace(/\s+/g, " ")}`;
  const cached = await prismaUnscoped.geocodeCache.findUnique({ where: { key } }).catch(() => null);
  if (cached) return { lat: cached.lat, lng: cached.lng };

  const urls: string[] = [];
  if (LOCATIONIQ_TOKEN) urls.push(`https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_TOKEN}&format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`);
  urls.push(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`);
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: GEO_HEADERS, signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const arr = (await r.json()) as { lat: string; lon: string }[];
      if (!arr.length) continue;
      const lat = Number(arr[0].lat), lng = Number(arr[0].lon);
      await prismaUnscoped.geocodeCache.upsert({ where: { key }, create: { key, lat, lng }, update: { lat, lng } }).catch(() => {});
      return { lat, lng };
    } catch { /* tenta o próximo provedor */ }
  }
  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<RevGeo> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { city: null, suburb: null };
  const key = `rev|${lat.toFixed(4)}|${lng.toFixed(4)}`;
  const cached = await prismaUnscoped.geocodeCache.findUnique({ where: { key } }).catch(() => null);
  if (cached?.label) { try { return JSON.parse(cached.label) as RevGeo; } catch { /* cache corrompido: refaz */ } }

  const urls: string[] = [];
  if (LOCATIONIQ_TOKEN) urls.push(`https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_TOKEN}&lat=${lat}&lon=${lng}&format=json&normalizeaddress=1&accept-language=pt-BR`);
  urls.push(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${lat}&lon=${lng}`);
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: GEO_HEADERS, signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { address?: Record<string, string> };
      const a = j.address;
      const out: RevGeo = {
        city: pick(a, ["city", "town", "municipality", "village", "city_district"]),
        suburb: pick(a, ["suburb", "neighbourhood", "quarter", "city_district", "residential"]),
      };
      if (out.city || out.suburb) {
        await prismaUnscoped.geocodeCache.upsert({ where: { key }, create: { key, lat, lng, label: JSON.stringify(out) }, update: { label: JSON.stringify(out) } }).catch(() => {});
        return out;
      }
    } catch { /* tenta o próximo provedor */ }
  }
  return { city: null, suburb: null };
}
