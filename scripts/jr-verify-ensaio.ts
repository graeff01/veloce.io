/**
 * Ensaio do verifyReplies: ele pegaria as invenções que o grounding não pega?
 *
 * Usa casos REAIS — a resposta sobre churrasqueira "espelhada" saiu do teste de
 * vision contra foto de lead. Mede também o custo de cada verificação.
 * Nada é gravado.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { verifyReply } from "@/lib/ai-agent/verify";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }

  // Fontes reais: os blocos de conhecimento que a busca entregaria numa conversa
  // sobre a Gourmet, mais o texto da conversa.
  const blocos = await prismaUnscoped.knowledgeChunk.findMany({
    where: { clientId: CLIENTE, title: { in: [
      "Churrasqueira Gourmet", "Churrasqueira Tradição Gourmet",
      "Lado aberto, em balanço, fogão embutido, bifeteira, fogão a gás — a qual modelo o cliente se refere",
    ] } },
    select: { title: true, content: true },
  });
  const conversa = "lead: o modelo gourmet seria este mesmo, só que espelhado, para o fogao ficar do outro lado";
  const sources = [...blocos.map((b) => `${b.title}\n${b.content}`), conversa].join("\n\n");

  const casos: { nome: string; resposta: string; deveriaPegar: boolean }[] = [
    {
      nome: "espelhado (invenção real, vista no teste de vision)",
      resposta: "Exatamente! O modelo Gourmet pode ser feito com a abertura para o lado esquerdo, para que o fogão fique do lado que você prefere. Já registrei aqui que você quer a abertura para a esquerda.",
      deveriaPegar: true,
    },
    {
      nome: "resposta correta sobre a Gourmet",
      resposta: "A Gourmet tem bifeteira a gás embutida e um dos lados balanceados. O valor é R$ 4.197.",
      deveriaPegar: false,
    },
    {
      nome: "cordialidade pura (não pode virar falso positivo)",
      resposta: "Que legal! Fico à disposição para o que precisar 😊",
      deveriaPegar: false,
    },
    {
      nome: "outra invenção de capacidade",
      resposta: "Sim, fabricamos a Gourmet em qualquer medida sob encomenda, é só dizer o tamanho.",
      deveriaPegar: true,
    },
  ];

  console.log(`fontes: ${sources.length} caracteres (~${Math.round(sources.length / 4)} tokens)\n${"=".repeat(72)}`);
  let acertos = 0;
  for (const c of casos) {
    const t0 = Date.now();
    const r = await verifyReply({ model: "gpt-4.1-mini", sources, reply: c.resposta, clientId: undefined });
    const ms = Date.now() - t0;
    const pegou = !r.ok;
    const ok = pegou === c.deveriaPegar;
    if (ok) acertos++;
    console.log(`\n${ok ? "✓" : "✗"} ${c.nome}`);
    console.log(`   esperado: ${c.deveriaPegar ? "BARRAR" : "deixar passar"} | resultado: ${pegou ? "BARROU" : "passou"} | ${ms}ms`);
    if (r.unsupported.length) console.log(`   apontou: ${r.unsupported.map((u) => `"${u.slice(0, 90)}"`).join(" | ")}`);
  }
  console.log(`\n${"=".repeat(72)}\n${acertos} de ${casos.length} corretos.`);
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
