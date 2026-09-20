/**
 * Medida sem fonte hoje só AVISA. O replay do Henrique mostrou que ela inventa
 * (Prime 7 = "70cm", Prime 9 = "84cm"; o cadastro diz 60 e 74) e ainda adota o
 * número que o CLIENTE dá.
 *
 * Fazer abster resolve os dois — mas abstenção indevida cala atendimento bom, e
 * isso já se provou pior que o problema. Então: quantas respostas REAIS seriam
 * barradas, e quantas delas estariam certas?
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { conhecimentoCompleto } from "@/lib/ai-agent/retrieval";
import { medidasEmCm, checkGrounding } from "@/lib/ai-agent/grounding";

const C = "cmrjao9n700dg5vudg1zlymk9";

async function main() {
  const acervo = await conhecimentoCompleto(C);
  const cfg = await db.aiAgentConfig.findUnique({ where: { clientId: C }, select: { customPrompt: true } });
  const oficiais = medidasEmCm(`${acervo}\n${cfg?.customPrompt ?? ""}`);
  console.log(`medidas oficiais no acervo: ${oficiais.size}`);

  const conns = (await db.waConnection.findMany({ where: { clientId: C }, select: { id: true } })).map((c) => c.id);
  const saidas = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: conns } }, direction: "out", aiGenerated: true, text: { not: null } },
    select: { text: true, timestamp: true, contact: { select: { displayName: true, name: true } } },
  });

  let comMedida = 0;
  const suspeitas: { quando: string; quem: string; texto: string; falta: string[] }[] = [];
  for (const s of saidas) {
    const gr = checkGrounding(s.text!, acervo, new Set<string>(), oficiais);
    if (!gr.medidaWarnings?.length) continue;
    comMedida++;
    suspeitas.push({
      quando: s.timestamp.toISOString().slice(0, 16),
      quem: s.contact.displayName ?? s.contact.name ?? "?",
      texto: String(s.text).replace(/\n/g, " ").slice(0, 118),
      falta: gr.medidaWarnings.slice(0, 3),
    });
  }
  console.log(`\n=== ${saidas.length} respostas reais da IA ===`);
  console.log(`  com medida SEM fonte: ${comMedida} (${((comMedida / saidas.length) * 100).toFixed(2)}%)`);
  console.log(`  → é quanto abster BARRARIA\n`);
  for (const s of suspeitas.slice(0, 22)) console.log(`  ${s.quando} [${s.quem}] falta=${s.falta.join(",")}\n     "${s.texto}"`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
