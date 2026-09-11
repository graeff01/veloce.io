import https from "node:https";
import { prismaUnscoped } from "@/lib/prisma";

// ── Re-sync de estoque (anti "carro vendido") ──────────────────────────────────
// Reimporta o estoque do cliente (página Autocarro) e mantém o catálogo da IA em dia:
// upsert por externalId, e o que sumiu do estoque vira available=false (não some do
// histórico). Roda 1x/dia pelo agendador interno, para cada cliente com catalogSourceUrl.

interface Offer {
  offerId: number; brand: string; model: string; version: string; km: string;
  fuel: string; gear: string; color: string; year: number; price: number;
  link: string; photoCover: string; doors: number; options?: { label: string }[];
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

// ── Segurança (F-01 da auditoria) ─────────────────────────────────────────────
// Antes: `rejectUnauthorized: false` para QUALQUER host, seguindo redirect livre.
// Isso permitia MITM envenenar a fonte de verdade de PREÇO — que vai direto ao prompt
// da IA e ao WhatsApp do lead. Agora a verificação de TLS é PADRÃO; a tolerância à
// cadeia incompleta fica restrita a uma allowlist explícita (o fornecedor conhecido),
// e o redirect só segue para https em host permitido.
const INSECURE_TLS_HOSTS = new Set(
  (process.env.CATALOG_SYNC_INSECURE_HOSTS ?? "m.autocarro.com.br,www.autocarro.com.br,autocarro.com.br")
    .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
);
const ALLOWED_SCHEMES = new Set(["https:"]);
const FETCH_TIMEOUT_MS = Number(process.env.CATALOG_SYNC_TIMEOUT_MS || 20_000);

function fetchInsecure(url: string, redirects = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error("muitos redirects"));
    let u: URL;
    try { u = new URL(url); } catch { return reject(new Error("url inválida")); }
    if (!ALLOWED_SCHEMES.has(u.protocol)) return reject(new Error(`esquema não permitido: ${u.protocol}`));
    const host = u.hostname.toLowerCase();
    // Só relaxa a validação do certificado nos hosts explicitamente listados.
    const rejectUnauthorized = !INSECURE_TLS_HOSTS.has(host);

    const req = https.get(url, { rejectUnauthorized, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url);
        if (!ALLOWED_SCHEMES.has(next.protocol)) return reject(new Error("redirect para esquema não permitido"));
        return resolve(fetchInsecure(next.toString(), redirects + 1));
      }
      let data = ""; res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("timeout no sync de catálogo")));
  });
}

function nextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

// Galeria do anúncio (capa + interior...). Só buscada para carro novo/sem galeria.
async function fetchGallery(link: string): Promise<string[]> {
  try {
    const d = nextData(await fetchInsecure(link)) as { props?: { pageProps?: { offer?: { photos?: { src: string }[] } } } } | null;
    const photos = d?.props?.pageProps?.offer?.photos ?? [];
    return photos.slice(0, 14).map((p) => `https://imgserver.autocarro.com.br/fotos/grande/${p.src}`).filter(Boolean);
  } catch { return []; }
}

export async function syncCatalogFromUrl(clientId: string, url: string): Promise<{ ok: boolean; total?: number; created?: number; updated?: number; unavailable?: number; error?: string }> {
  let offers: Offer[];
  try {
    const d = nextData(await fetchInsecure(url)) as { props?: { pageProps?: { offers?: Offer[] } } } | null;
    if (!d) return { ok: false, error: "estrutura da página mudou" };
    offers = d.props?.pageProps?.offers ?? [];
  } catch (e) { return { ok: false, error: String(e).slice(0, 200) }; }
  if (!offers.length) return { ok: false, error: "estoque vazio na página" };

  const seen: string[] = [];
  let created = 0, updated = 0;
  for (const o of offers) {
    const externalId = String(o.offerId);
    seen.push(externalId);
    const title = `${cap(o.brand)} ${cap(o.model)} ${o.version} ${o.year}`.replace(/\s+/g, " ").trim();
    const attributes = {
      ano: o.year, km: o.km ? `${o.km} km` : undefined, cambio: o.gear, combustivel: cap(o.fuel),
      cor: cap(o.color), portas: o.doors, opcionais: (o.options ?? []).slice(0, 12).map((x) => x.label).join(", ") || undefined,
    };
    const data = { title, price: o.price || null, available: true, attributes, url: o.link, imageUrl: o.photoCover || null, syncedAt: new Date() };
    const existing = await prismaUnscoped.catalogItem.findFirst({ where: { clientId, externalId }, select: { id: true, images: true } });
    // Busca galeria só p/ carro novo ou sem galeria (evita 44 fetches por re-sync).
    const images = (!existing || !existing.images?.length) ? await fetchGallery(o.link) : undefined;
    if (existing) { await prismaUnscoped.catalogItem.update({ where: { id: existing.id }, data: { ...data, ...(images?.length ? { images } : {}) } }); updated++; }
    else { await prismaUnscoped.catalogItem.create({ data: { clientId, externalId, ...data, images: images ?? [] } }); created++; }
  }
  const gone = await prismaUnscoped.catalogItem.updateMany({ where: { clientId, available: true, externalId: { notIn: seen } }, data: { available: false } });
  return { ok: true, total: offers.length, created, updated, unavailable: gone.count };
}

// Roda o re-sync para todos os clientes com fonte de estoque configurada.
export async function syncAllCatalogs(): Promise<{ clients: number }> {
  const cfgs = await prismaUnscoped.aiAgentConfig.findMany({ where: { catalogSourceUrl: { not: null } }, select: { clientId: true, catalogSourceUrl: true } });
  for (const c of cfgs) if (c.catalogSourceUrl) await syncCatalogFromUrl(c.clientId, c.catalogSourceUrl).catch(() => {});
  return { clients: cfgs.length };
}
