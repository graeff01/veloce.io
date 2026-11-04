/**
 * Lomba do Pinheiro: zona própria de R$ 250 (apontamento 7 da Maria).
 *
 * Ela estava como BAIRRO da zona Central de Porto Alegre, logo saía cotada a
 * R$ 160 — foi o que aconteceu no orçamento nº 18. A Maria corrigiu: é R$ 250.
 *
 * Não dava para só trocar de zona: Porto Alegre tem Central 160, Zona Sul 200 e
 * Extremo Sul 300. Nenhuma é 250. Então a Lomba vira zona própria.
 *
 * A COORDENADA vai junto, e isso é o ponto delicado: o motor resolve a zona pelo
 * pin que o lead manda, não pelo texto do endereço. Bairro movido sem a
 * coordenada viraria uma zona que nunca casa — o defeito de frete que já nos
 * custou retrabalho antes.
 *
 * Uso (DRY-RUN por padrão):
 *   railway run --service Postgres bash -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL";
 *     npx tsx scripts/jr-frete-lomba.ts'
 *   ...e de novo com --commit para gravar.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
const commit = process.argv.includes("--commit");

type Bairro = { name: string; lat?: number; lng?: number };
type Linha = { city?: string; zone?: string; amount?: number; region?: string; code?: string;
               aliases?: string[]; assembly?: string; neighborhoods?: Bairro[] };

const ALVO = "lomba do pinheiro";
const VALOR = 250;

(async () => {
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error("JR não encontrada"); process.exit(1); }
  const pc = await prisma.pricingConfig.findFirst({ where: { clientId: c.id }, select: { id: true, rules: true } });
  if (!pc) { console.error("PricingConfig não encontrada"); process.exit(1); }

  const rules = { ...(pc.rules as Record<string, unknown>) };
  const freight = [...((rules.freight ?? []) as Linha[])];

  if (freight.some((f) => f.zone?.toLowerCase().includes(ALVO))) {
    console.log(`\n  ✅ A Lomba já tem zona própria. Nada a fazer.\n`); return;
  }
  const iCentral = freight.findIndex((f) => /porto alegre/i.test(f.city ?? "") && /central/i.test(f.zone ?? ""));
  if (iCentral < 0) { console.error("zona Central de POA não encontrada"); process.exit(1); }

  const central = freight[iCentral];
  const bairros = [...(central.neighborhoods ?? [])];
  const iLomba = bairros.findIndex((b) => b.name?.toLowerCase().includes(ALVO));
  if (iLomba < 0) { console.error("bairro Lomba do Pinheiro não achado na Central"); process.exit(1); }
  const lomba = bairros[iLomba];

  console.log(`\n── ${c.name} · frete Lomba do Pinheiro ──`);
  console.log(`  ANTES: bairro da zona "${central.zone}" → R$ ${central.amount}`);
  console.log(`  pin:   lat ${lomba.lat}  lng ${lomba.lng}`);

  // 1) sai da Central
  bairros.splice(iLomba, 1);
  freight[iCentral] = { ...central, neighborhoods: bairros };
  // 2) vira zona própria, herdando cidade/código da Central
  const nova: Linha = {
    city: central.city, code: central.code, zone: "Lomba do Pinheiro", amount: VALOR,
    region: `${central.city} — Lomba do Pinheiro`,
    aliases: ["lomba do pinheiro", "lomba"],
    neighborhoods: [lomba],
  };
  freight.push(nova);

  console.log(`  DEPOIS: zona própria "${nova.zone}" → R$ ${VALOR}`);
  console.log(`  Central fica com ${bairros.length} bairros (era ${(central.neighborhoods ?? []).length})`);
  console.log(`  total de linhas de frete: ${freight.length}`);

  if (!commit) { console.log(`\n  (DRY-RUN — nada gravado). Rode com --commit.\n`); return; }
  rules.freight = freight;
  await prisma.pricingConfig.update({ where: { id: pc.id }, data: { rules: rules as never } });
  console.log(`\n  ✅ gravado.\n`);
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
