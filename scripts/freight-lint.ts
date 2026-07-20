// Roda o validador de acurácia do frete contra o cadastro REAL de um cliente.
// Uso (com env de produção via Railway):
//   railway run --service Postgres bash -lc \
//     'export DATABASE_URL="$DATABASE_PUBLIC_URL"; npx tsx scripts/freight-lint.ts <slug>'
// <slug> = slug do cliente (ex.: jr-churrasqueiras). Sem arg: lista todos os clientes
// que têm frete cadastrado e valida cada um.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { lintFreight, formatFreightLint } from "../lib/ai-agent/freight-lint";
import { type FreightRegion } from "../lib/ai-agent/pricing";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function freightOf(rules: unknown): FreightRegion[] {
  const r = rules as { freight?: FreightRegion[] } | null;
  return Array.isArray(r?.freight) ? r!.freight! : [];
}

async function main() {
  const slug = process.argv[2];
  const where = slug ? { slug } : {};
  const clients = await prisma.client.findMany({ where, select: { slug: true, name: true, id: true } });
  if (!clients.length) { console.log(`Nenhum cliente${slug ? ` com slug "${slug}"` : ""}.`); return; }

  let totalErros = 0;
  for (const c of clients) {
    const pc = await prisma.pricingConfig.findUnique({ where: { clientId: c.id }, select: { rules: true } });
    const freight = freightOf(pc?.rules);
    if (!freight.length) { if (slug) console.log(`[${c.slug}] sem frete cadastrado.`); continue; }
    const issues = lintFreight(freight);
    totalErros += issues.filter((i) => i.level === "erro").length;
    console.log(`\n=== ${c.name} (${c.slug}) — ${freight.length} regiões ===`);
    console.log(formatFreightLint(issues));
  }
  process.exitCode = totalErros > 0 ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
