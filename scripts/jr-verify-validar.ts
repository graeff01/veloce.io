/**
 * Validação do auditor (verifyReplies) contra RESPOSTAS REAIS já enviadas.
 *
 * Duas amostras:
 *  • SEGURAS  — respostas que a IA de fato mandou ao lead em produção. Barrar
 *               qualquer uma é FALSO POSITIVO: em produção isso vira abstenção
 *               ("prefiro confirmar com um vendedor") numa resposta boa.
 *  • INVENÇÕES — afirmações que contradizem ou extrapolam o cadastro. Passar
 *               qualquer uma é FALSO NEGATIVO.
 *
 * As fontes são remontadas como em produção: conhecimento recuperado para a
 * mensagem do lead + o texto da conversa. Nada é gravado.
 *
 * Uso: npx tsx scripts/jr-verify-validar.ts [--limit 25]
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { verifyReply, daResposta } from "@/lib/ai-agent/verify";
import { retrieveKnowledge } from "@/lib/ai-agent/retrieval";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

// Extrapolam o cadastro da JR — capacidade de fabricação, política, cobertura.
// A primeira saiu do teste de vision contra foto real de lead.
const INVENCOES = [
  "Exatamente! O modelo Gourmet pode ser feito com a abertura para o lado esquerdo, para que o fogão fique do lado que você prefere.",
  "Sim, fabricamos a Gourmet em qualquer medida sob encomenda, é só dizer o tamanho.",
  "A Linha Popular também aceita lenha sem problema, pode usar tranquilo.",
  "Entregamos e montamos em Florianópolis sem custo adicional.",
  "Todos os nossos modelos têm 5 anos de garantia contra qualquer defeito.",
  "A Prime 7 espetos tem 1,20 m de largura.",
];

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  const limite = Number(arg("limit") ?? 25);
  const conns = (await prismaUnscoped.waConnection.findMany({ where: { clientId: CLIENTE }, select: { id: true } })).map((c) => c.id);

  // Respostas REAIS da IA, com a mensagem do lead que as provocou.
  const enviadas = await prismaUnscoped.waMessage.findMany({
    where: { connectionId: { in: conns }, direction: "out", aiGenerated: true, text: { not: null } },
    orderBy: { timestamp: "desc" }, take: limite * 3,
    select: { id: true, text: true, timestamp: true, contactId: true },
  });

  const seguras: { reply: string; sources: string }[] = [];
  for (const m of enviadas) {
    if (seguras.length >= limite) break;
    if (!m.text || m.text.length < 40) continue; // resposta curta demais não exercita nada
    const antes = await prismaUnscoped.waMessage.findMany({
      where: { contactId: m.contactId, timestamp: { lt: m.timestamp }, text: { not: null } },
      orderBy: { timestamp: "desc" }, take: 8, select: { direction: true, text: true },
    });
    const conversa = [...antes].reverse().map((x) => `${x.direction === "in" ? "lead" : "atendente"}: ${x.text}`).join("\n");
    const ultimaDoLead = [...antes].find((x) => x.direction === "in")?.text ?? m.text;
    const { chunks } = await retrieveKnowledge(CLIENTE, ultimaDoLead).catch(() => ({ chunks: [] as { title: string | null; content: string }[] }));
    const sources = [...chunks.map((c) => `${c.title ?? ""}\n${c.content}`), conversa].join("\n\n");
    seguras.push({ reply: m.text, sources });
  }

  const fontesComuns = seguras[0]?.sources ?? "";

  console.log(`SEGURAS: ${seguras.length} respostas reais · INVENÇÕES: ${INVENCOES.length}\n${"=".repeat(74)}`);

  let falsoPositivo = 0, descartadosTotal = 0;
  for (const [i, s] of seguras.entries()) {
    const r = await verifyReply({ model: "gpt-4.1-mini", sources: s.sources, reply: s.reply });
    descartadosTotal += r.descartados?.length ?? 0;
    if (!r.ok) {
      falsoPositivo++;
      console.log(`\n⚠ FALSO POSITIVO [${i + 1}]`);
      console.log(`  resposta: ${s.reply.replace(/\n/g, " ").slice(0, 150)}`);
      console.log(`  apontou : ${r.unsupported.map((u) => `"${u.slice(0, 100)}"`).join(" | ")}`);
      for (const u of r.unsupported) {
        console.log(`  [debug] daResposta("${u.slice(0, 50)}…") = ${daResposta(u, s.reply, s.sources)}`);
      }
    }
    if (r.descartados?.length) console.log(`  [debug] descartados em [${i + 1}]: ${r.descartados.length}`);
  }

  let falsoNegativo = 0;
  for (const inv of INVENCOES) {
    const r = await verifyReply({ model: "gpt-4.1-mini", sources: fontesComuns, reply: inv });
    if (r.ok) { falsoNegativo++; console.log(`\n⚠ PASSOU (deveria barrar): "${inv.slice(0, 110)}"`); }
  }

  const taxaFP = seguras.length ? (100 * falsoPositivo / seguras.length) : 0;
  const pego = INVENCOES.length - falsoNegativo;
  console.log(`\n${"=".repeat(74)}`);
  console.log(`falso positivo : ${falsoPositivo}/${seguras.length}  (${taxaFP.toFixed(1)}%)  ← cala resposta boa`);
  console.log(`invenção pega  : ${pego}/${INVENCOES.length}`);
  console.log(`itens descartados pelo filtro: ${descartadosTotal} (viriam das fontes, não da resposta)`);
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
