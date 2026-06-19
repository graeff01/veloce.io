/**
 * Importa o estoque de uma loja no Autocarro para o catálogo da IA (CatalogItem).
 * Lê o JSON __NEXT_DATA__ da página da loja (server-rendered). Idempotente: upsert por
 * (clientId, externalId=offerId). Marca como indisponível o que sumiu do estoque.
 *
 * Uso: NODE_TLS_REJECT_UNAUTHORIZED=0 railway run --service Postgres \
 *        npx tsx scripts/import-autocarro.ts <urlDaLoja> <nomeCliente> [--commit]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const dealerUrl = process.argv[2];
const clientName = process.argv[3] || "boqueir";
const commit = process.argv.includes("--commit");
if (!dealerUrl) { console.error("Uso: import-autocarro.ts <urlDaLoja> <nomeCliente> [--commit]"); process.exit(1); }

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }

interface Offer {
  offerId: number; brand: string; model: string; version: string; km: string;
  fuel: string; gear: string; color: string; year: number; price: number;
  link: string; photoCover: string; doors: number; options?: { label: string }[];
}

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

(async () => {
  const res = await fetch(dealerUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) { console.error("Não achei o estoque na página (estrutura mudou?)."); process.exit(1); }
  const offers: Offer[] = JSON.parse(m[1])?.props?.pageProps?.offers ?? [];
  if (!offers.length) { console.error("Estoque vazio na página."); process.exit(1); }
  console.log(`Encontrados ${offers.length} veículos no estoque.`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
  const client = await prisma.client.findFirst({ where: { name: { contains: clientName, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.error(`Cliente "${clientName}" não encontrado`); process.exit(1); }
  console.log(`Cliente: ${client.name}${commit ? "" : "  (DRY-RUN — use --commit para gravar)"}\n`);

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

    console.log(`  ${title} — R$ ${(o.price || 0).toLocaleString("pt-BR")} · ${o.km} km`);
    if (!commit) continue;
    const existing = await prisma.catalogItem.findFirst({ where: { clientId: client.id, externalId }, select: { id: true } });
    if (existing) { await prisma.catalogItem.update({ where: { id: existing.id }, data }); updated++; }
    else { await prisma.catalogItem.create({ data: { clientId: client.id, externalId, ...data } }); created++; }
  }

  if (commit) {
    // Some do estoque → indisponível (não apaga histórico).
    const gone = await prisma.catalogItem.updateMany({
      where: { clientId: client.id, available: true, externalId: { notIn: seen } },
      data: { available: false },
    });
    console.log(`\n✅ Criados: ${created} · atualizados: ${updated} · marcados indisponíveis: ${gone.count}`);
  } else {
    console.log(`\n(DRY-RUN) ${offers.length} veículos prontos para importar. Rode com --commit para gravar.`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
