import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import fs from "fs";
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: (process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)! })) });
(async () => {
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true } });
  const conn = await prisma.waConnection.findFirst({ where: { clientId: c!.id }, select: { id: true } });
  const leads = await prisma.waLead.findMany({ where: { connectionId: conn!.id, adImageUrl: { not: null } }, select: { adImageUrl: true }, orderBy: { enteredAt: "desc" }, take: 6 });
  let n = 0;
  for (const l of leads) {
    const r = await fetch(l.adImageUrl!).catch(() => null);
    if (!r?.ok) continue;
    fs.writeFileSync(`${process.env.OUT}/criativo-${++n}.jpg`, Buffer.from(await r.arrayBuffer()));
    if (n >= 2) break;
  }
  console.log("baixados:", n);
})().catch(e=>{console.error(e.message);process.exit(1)});
