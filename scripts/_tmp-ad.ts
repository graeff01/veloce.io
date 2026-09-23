import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: (process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)! })) });
(async () => {
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true } });
  const conn = await prisma.waConnection.findFirst({ where: { clientId: c!.id }, select: { id: true } });
  const leads = await prisma.waLead.findMany({ where: { connectionId: conn!.id }, select: { adTitle: true, adModel: true, adBody: true, adImageUrl: true }, take: 200 });
  console.log("leads de anúncio:", leads.length);
  const comModelo = leads.filter(l => (l.adModel ?? "").trim());
  console.log("com adModel preenchido:", comModelo.length);
  const titulos: Record<string, number> = {};
  for (const l of leads) { const t = (l.adTitle ?? "(sem título)").slice(0, 60); titulos[t] = (titulos[t] || 0) + 1; }
  console.log("\nadTitle distintos:");
  for (const [t, n] of Object.entries(titulos).sort((a,b)=>b[1]-a[1])) console.log(`  ${n}x  ${t}`);
  console.log("\ncom adImageUrl:", leads.filter(l => (l.adImageUrl ?? "").trim()).length);
  const body = leads.find(l => (l.adBody ?? "").trim());
  if (body) console.log("\nexemplo de adBody:", JSON.stringify((body.adBody ?? "").slice(0, 220)));
})().catch(e=>{console.error(e.message);process.exit(1)});
