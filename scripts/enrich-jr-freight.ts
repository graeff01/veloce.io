// Enriquece o frete da JR (PricingConfig.rules.freight[]) IN PLACE, adicionando:
//  - code: município IBGE (casado pelo nome) → pinta o mapa no painel;
//  - assembly: "required" p/ as regiões da lista "Frete Obrigatório com Montagem".
// Não cria tabela nova nem muda valores — só anexa metadados ao dado que já existe.
// Uso:  tsx scripts/enrich-jr-freight.ts --dry   (relatório, não grava)
//       tsx scripts/enrich-jr-freight.ts         (grava rules.freight enriquecido)
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { normalizeName } from "../lib/utils";

const DRY = process.argv.includes("--dry");
const JR_SLUG = "jr-churrasqueiras";

const OBRIGATORIO_MONTAGEM = new Set([
  "estancia velha", "lindolfo collor", "pareci", "parque eldorado", "porto alegre zs",
  "viamao", "nova hartz", "viamao zr", "morro reuter", "aguas claras", "capela de santana",
  "guaiba zr", "montenegro", "porto alegre extremo sul", "gravatai rural", "bom principio",
  "charqueadas", "triunfo", "glorinha", "ararica", "arroio dos ratos", "barra do ribeiro",
  "fazenda vilanova", "itapua", "linha nova", "parobe", "presidente lucena",
  "sao jose do hortencio", "sao sebastiao do cai", "bom retiro do sul", "harmonia",
  "alto feliz", "butia", "osorio", "taquara", "sentinela do sul", "vale real",
  "carlos barbosa", "estrela", "farroupilha", "feliz", "lajeado", "mariante",
  "sao pedro da serra", "venancio aires", "bacupari", "capivari do sul", "litoral",
  "maquine", "salvador do sul", "sertao santana", "tapes", "tramandai", "tupandi",
  "minas do leao", "taquari", "garibaldi", "nova petropolis", "picada cafe",
  "santa maria do herval", "taquara rural", "arroio do sal", "bento goncalves", "canela",
  "caxias do sul", "cotipora", "general camara", "mariana pimentel", "palmares do sul",
  "santo antonio da patrulha", "sao francisco de paula", "sao vendelino", "sapiranga rural",
  "terra de areia", "tres cachoeiras", "westfalia", "arambare", "santa lucia do piai",
  "arroio do meio", "barao", "boa vista do sul", "cerro grande do sul", "cruzeiro do sul",
  "flores da cunha", "forquetinha", "igrejinha", "marata", "marques de souza",
  "pantano grande", "rolante", "teutonia", "encantado", "gramado", "tres coroas",
]);

const NAME_FIXES: Record<string, string> = { "sapucaia": "sapucaia do sul" };
const ZONE_SUFFIXES: RegExp[] = [/\s+extremo\s+sul$/i, /\s+zona\s+rural$/i, /\s+rural$/i, /\s+zona\s+sul$/i, /\s+zs$/i, /\s+zr$/i];
function citySlugOf(region: string): string {
  let city = region.trim();
  for (const re of ZONE_SUFFIXES) if (re.test(city)) { city = city.replace(re, "").trim(); break; }
  const slug = normalizeName(city);
  return NAME_FIXES[slug] ?? slug;
}

function ibgeIndex(): Map<string, string> {
  const geo = JSON.parse(readFileSync(new URL("../public/geo/rs-municipios.geojson", import.meta.url), "utf8"));
  return new Map<string, string>(geo.features.map((f: { properties: { slug: string; code: string } }) => [f.properties.slug, f.properties.code]));
}

type Freight = { region: string; amount: number; aliases?: string[]; code?: string | null; assembly?: "optional" | "required" };

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const client = await prisma.client.findFirst({ where: { slug: JR_SLUG }, select: { id: true, name: true } });
    if (!client) throw new Error(`Cliente ${JR_SLUG} não encontrado`);
    const pc = await prisma.pricingConfig.findUnique({ where: { clientId: client.id } });
    const rules = (pc?.rules ?? {}) as { freight?: Freight[]; [k: string]: unknown };
    const freight = rules.freight ?? [];
    if (!freight.length) throw new Error("Sem rules.freight para enriquecer");

    const idx = ibgeIndex();
    let matched = 0, required = 0;
    const unmatched: string[] = [];
    const enriched: Freight[] = freight.map((f) => {
      const code = idx.get(citySlugOf(f.region)) ?? null;
      const regionSlug = normalizeName(f.region);
      const assembly: "required" | undefined = OBRIGATORIO_MONTAGEM.has(regionSlug) ? "required" : undefined;
      if (code) matched++; else unmatched.push(f.region);
      if (assembly) required++;
      return { ...f, code, ...(assembly ? { assembly } : {}) };
    });

    console.log(`\nJR (${client.id}): ${freight.length} regiões | ${matched} casadas c/ IBGE | ${unmatched.length} sem polígono | ${required} c/ montagem obrigatória`);
    console.log(`SEM polígono: ${unmatched.join(", ")}`);
    if (DRY) { console.log("\n[--dry] nada gravado."); return; }

    await prisma.pricingConfig.update({ where: { clientId: client.id }, data: { rules: { ...rules, freight: enriched } as object } });
    console.log(`\n✔ rules.freight enriquecido p/ ${client.name} (${matched} codes, ${required} montagens).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
