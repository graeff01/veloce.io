import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: (process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)! })) });
(async () => {
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true } });
  const conn = await prisma.waConnection.findFirst({ where: { clientId: c!.id }, select: { id: true } });
  const leads = await prisma.waLead.findMany({ where: { connectionId: conn!.id, adImageUrl: { not: null } }, select: { adImageUrl: true, enteredAt: true }, orderBy: { enteredAt: "desc" }, take: 4 });
  for (const l of leads) {
    const u = l.adImageUrl!;
    try {
      const r = await fetch(u, { method: "GET" });
      const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      console.log(`${l.enteredAt.toISOString().slice(0,10)} · HTTP ${r.status} · ${r.headers.get("content-type")} · ${buf ? (buf.length/1024).toFixed(0)+"KB" : "-"} · ${u.slice(0, 70)}...`);
    } catch (e) { console.log(`${l.enteredAt.toISOString().slice(0,10)} · ERRO: ${(e as Error).message.slice(0,60)}`); }
  }
})().catch(e=>{console.error(e.message);process.exit(1)});
