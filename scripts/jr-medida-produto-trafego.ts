/** A checagem produto→dimensão contra tudo que a IA já respondeu. */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { conhecimentoCompleto } from "@/lib/ai-agent/retrieval";
import { lerTabelaMedidas, medidasErradasDoProduto } from "@/lib/ai-agent/medidas-produto";

const C = "cmrjao9n700dg5vudg1zlymk9";
async function main() {
  const tabela = lerTabelaMedidas(await conhecimentoCompleto(C));
  console.log(`modelos na tabela: ${tabela.length}`);
  for (const m of tabela) console.log(`  ${m.produto.padEnd(26)} ${m.largura} x ${m.profundidade} x ${m.altura}`);

  const conns = (await db.waConnection.findMany({ where: { clientId: C }, select: { id: true } })).map((c) => c.id);
  const saidas = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: conns } }, direction: "out", aiGenerated: true, text: { not: null } },
    select: { text: true, timestamp: true, contact: { select: { displayName: true, name: true } } },
  });
  const pegos = saidas.map((s) => ({ s, e: medidasErradasDoProduto(s.text!, tabela) })).filter((x) => x.e.length);
  console.log(`\n=== ${saidas.length} respostas reais · barraria ${pegos.length} (${((pegos.length / saidas.length) * 100).toFixed(2)}%) ===`);
  for (const p of pegos) {
    console.log(`  ${p.s.timestamp.toISOString().slice(0, 16)} [${p.s.contact.displayName ?? p.s.contact.name}]`);
    for (const e of p.e) console.log(`     ✗ ${e}`);
    console.log(`     "${String(p.s.text).replace(/\n/g, " ").slice(0, 104)}"`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
