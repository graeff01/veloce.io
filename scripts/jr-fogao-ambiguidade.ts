/**
 * Pergunta do Douglas para a Maria (17/09): quando o lead pede "churrasqueira com
 * fogão", vale a IA perguntar se é EMBUTIDO ou FORA (Fogão Campeiro ao lado)?
 *
 * Hoje o conhecimento ADIVINHA: "quando o cliente fala 'a churrasqueira com o
 * fogão', ele se refere ao EMBUTIDO — NÃO acrescente o Fogão Campeiro".
 *
 * Este script mede se a adivinhação se sustenta: dos leads REAIS que pedem fogão,
 * quantos já dizem qual dos dois querem, e quantos ficam ambíguos.
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";

const sa = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Diz EMBUTIDO: fogão dentro/na peça da churrasqueira.
const EMBUTIDO = /\b(embutid|acoplad|integrad|dentro da churrasqueira|dentro dela|na lateral|lado aberto|em balanco|balancead|ja vem com|bifeteira|a gas|na propria)/;
// Diz FORA: fogão campeiro, peça separada ao lado.
const FORA = /\b(campeir|ao lado|do lado|separad|a parte|conjunto|junto com|mais um fogao|\+ ?fogao|e um fogao|e fogao campeiro)/;

async function main() {
  const conns = (await db.waConnection.findMany({ select: { id: true } })).map((c) => c.id);
  const msgs = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: conns } }, direction: "in", text: { not: null } },
    select: { text: true }, take: 60000,
  });

  const pedeFogao = msgs.filter((m) => {
    const t = sa(String(m.text));
    return /\bfogao|campeir/.test(t) && /churrasqueir/.test(t);
  });

  let emb = 0, fora = 0, ambos = 0, ambiguo = 0;
  const exAmbiguo: string[] = [], exEmb: string[] = [], exFora: string[] = [];
  for (const m of pedeFogao) {
    const t = sa(String(m.text));
    const e = EMBUTIDO.test(t), f = FORA.test(t);
    if (e && f) { ambos++; }
    else if (e) { emb++; if (exEmb.length < 5) exEmb.push(String(m.text).slice(0, 100)); }
    else if (f) { fora++; if (exFora.length < 5) exFora.push(String(m.text).slice(0, 100)); }
    else { ambiguo++; if (exAmbiguo.length < 14) exAmbiguo.push(String(m.text).slice(0, 100)); }
  }

  const tot = pedeFogao.length;
  const pct = (n: number) => `${((n / tot) * 100).toFixed(1)}%`;
  console.log(`=== ${tot} mensagens reais que pedem churrasqueira COM FOGÃO ===\n`);
  console.log(`  diz EMBUTIDO  : ${String(emb).padStart(4)}  ${pct(emb)}`);
  console.log(`  diz FORA      : ${String(fora).padStart(4)}  ${pct(fora)}  ← a adivinhação erra AQUI`);
  console.log(`  diz os DOIS   : ${String(ambos).padStart(4)}  ${pct(ambos)}`);
  console.log(`  AMBÍGUO       : ${String(ambiguo).padStart(4)}  ${pct(ambiguo)}  ← a pergunta do Douglas resolve`);

  console.log(`\n── ambíguos (a IA hoje chuta "embutido") ──`);
  for (const e of exAmbiguo) console.log(`   "${e.replace(/\n/g, " ")}"`);
  console.log(`\n── já dizem FORA/campeiro (hoje o chute erra) ──`);
  for (const e of exFora) console.log(`   "${e.replace(/\n/g, " ")}"`);
  console.log(`\n── já dizem EMBUTIDO (hoje o chute acerta) ──`);
  for (const e of exEmb) console.log(`   "${e.replace(/\n/g, " ")}"`);

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
