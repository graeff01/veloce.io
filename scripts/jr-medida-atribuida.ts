/** O detector separa medida INVENTADA de produto do eco legítimo do cliente? */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { conhecimentoCompleto } from "@/lib/ai-agent/retrieval";
import { medidasEmCm } from "@/lib/ai-agent/grounding";
import { medidasInventadas } from "@/lib/ai-agent/grounding";

const C = "cmrjao9n700dg5vudg1zlymk9";

// As duas invenções que o replay do Henrique produziu (cadastro: 60 e 74).
const DO_REPLAY = [
  "Henrique, a churrasqueira Prime 7 espetos tem 70 cm de largura, 60 cm de profundidade e 2,20 m de altura.",
  "Henrique, a churrasqueira Prime 9 espetos tem 84 cm de largura, 60 cm de profundidade e 2,20 m de altura.",
];
// Respostas REAIS que o aviso antigo marcava e que são legítimas.
const LEGITIMAS = [
  "Marcelo, com a cobertura de policarbonato a 2,83 m de altura, a chaminé precisa ultrapassar 1,50 m.",
  "Perfeito, Maria! Com 3 metros de altura no pé-direito, a Prime 9 vai encaixar super bem.",
  "Como você precisa de 7 blocos, que são 1,4 metros, essa quantidade excede o limite.",
  "Cristofer, para a chaminé total de 6 metros, podemos incluir até 5 blocos de concreto.",
  "Para 5 metros seriam 25 blocos, mas o máximo são 5 blocos (1 metro), ok?",
];

async function main() {
  const acervo = await conhecimentoCompleto(C);
  const cfg = await db.aiAgentConfig.findUnique({ where: { clientId: C }, select: { customPrompt: true } });
  const of = medidasEmCm(`${acervo}\n${cfg?.customPrompt ?? ""}`);

  console.log("═══ deve BARRAR (invenção do replay) ═══");
  for (const t of DO_REPLAY) {
    const inv = medidasInventadas(t, of);
    console.log(`  ${inv.length ? "✓ barrou " + inv.join(",") : "✗ PASSOU"} · ${t.slice(0, 74)}`);
  }
  console.log("\n═══ deve PASSAR (medida do cliente / conta) ═══");
  for (const t of LEGITIMAS) {
    const inv = medidasInventadas(t, of);
    console.log(`  ${inv.length ? "✗ BARROU " + inv.join(",") : "✓ passou"} · ${t.slice(0, 74)}`);
  }

  const conns = (await db.waConnection.findMany({ where: { clientId: C }, select: { id: true } })).map((c) => c.id);
  const saidas = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: conns } }, direction: "out", aiGenerated: true, text: { not: null } },
    select: { text: true, contact: { select: { displayName: true, name: true } } },
  });
  const pegos = saidas.map((s) => ({ s, inv: medidasInventadas(s.text!, of) })).filter((x) => x.inv.length);
  console.log(`\n═══ ${saidas.length} respostas REAIS · barraria ${pegos.length} (${((pegos.length / saidas.length) * 100).toFixed(2)}%) ═══`);
  for (const p of pegos.slice(0, 12)) console.log(`  [${p.inv.join(",")}] ${String(p.s.text).replace(/\n/g, " ").slice(0, 112)}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
