/** O que o detector de segurança já viu em produção, rodando em modo sombra. */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
(async () => {
  const n = await db.aiSecurityEvent.count();
  console.log(`eventos de segurança registrados: ${n}`);
  if (n) {
    const ev = await db.aiSecurityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    for (const e of ev) console.log(`  ${e.createdAt.toISOString().slice(0,16)} · ${JSON.stringify(e).slice(0, 220)}`);
  }
  // Quantas mensagens de lead da JR o detector PEGARIA hoje? (medida de alarme falso)
  const { detectInjection } = await import("@/lib/ai-agent/security/detect");
  const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
  const conns = (await db.waConnection.findMany({ where: { clientId: CLIENTE }, select: { id: true } })).map(c => c.id);
  const msgs = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: conns } }, direction: "in", text: { not: null } },
    select: { text: true }, take: 20000,
  });
  let obs = 0, rig = 0, res = 0, cont = 0;
  const exemplos: string[] = [];
  for (const m of msgs) {
    const d = detectInjection(m.text);
    if (d.score >= 0.85) { cont++; if (exemplos.length < 12) exemplos.push(`[${d.score} ${d.labels.join(",")}] ${String(m.text).slice(0,110)}`); }
    else if (d.score >= 0.6) { res++; if (exemplos.length < 12) exemplos.push(`[${d.score} ${d.labels.join(",")}] ${String(m.text).slice(0,110)}`); }
    else if (d.score >= 0.3) { rig++; }
    else if (d.score > 0) obs++;
  }
  console.log(`\n=== detector rodado sobre ${msgs.length} mensagens REAIS de leads da JR ===`);
  console.log(`  conter   (≥0.85): ${cont}`);
  console.log(`  restringir(≥0.6): ${res}`);
  console.log(`  rigor    (≥0.3): ${rig}`);
  console.log(`  só sinal  (>0)  : ${obs}`);
  console.log(`  limpas          : ${msgs.length - cont - res - rig - obs}`);
  if (exemplos.length) { console.log(`\n  o que subiria de faixa:`); for (const e of exemplos) console.log(`   ${e}`); }
  await db.$disconnect();
})();
