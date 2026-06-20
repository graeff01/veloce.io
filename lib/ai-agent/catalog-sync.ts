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

// GET tolerante a cadeia de certificado incompleta (caso do m.autocarro.com.br).
function fetchInsecure(url: string, redirects = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error("muitos redirects"));
    https.get(url, { rejectUnauthorized: false, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchInsecure(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      let data = ""; res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

export async function syncCatalogFromUrl(clientId: string, url: string): Promise<{ ok: boolean; total?: number; created?: number; updated?: number; unavailable?: number; error?: string }> {
  let offers: Offer[];
  try {
    const html = await fetchInsecure(url);
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return { ok: false, error: "estrutura da página mudou" };
    offers = JSON.parse(m[1])?.props?.pageProps?.offers ?? [];
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
    const existing = await prismaUnscoped.catalogItem.findFirst({ where: { clientId, externalId }, select: { id: true } });
    if (existing) { await prismaUnscoped.catalogItem.update({ where: { id: existing.id }, data }); updated++; }
    else { await prismaUnscoped.catalogItem.create({ data: { clientId, externalId, ...data } }); created++; }
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
