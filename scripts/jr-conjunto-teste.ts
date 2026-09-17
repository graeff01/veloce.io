/**
 * Verifica o pedido da Maria (17/09) e, principalmente, que ele NÃO quebrou os
 * dois caminhos vizinhos. Nada é enviado nem gravado.
 *
 *  1. conjunto SEM modelo nomeado  → catálogo completo, sem perguntar
 *  2. conjunto COM modelo nomeado  → foto (como era)
 *  3. produto único                → pergunta "modelo ou catálogo" (como era)
 *
 * Em todos: no primeiro contato, pergunta de loja e vídeo vêm ANTES.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

type Caso = { nome: string; turnos: string[]; esperaFerramenta: string; proibeFerramenta?: string; proibeTexto?: RegExp; esperaTexto?: RegExp };

const CASOS: Caso[] = [
  {
    // O pedido da Maria (17/09): perguntar embutido ou fora ANTES de mostrar.
    nome: "1. 'churrasqueira com fogão' → PERGUNTA embutido ou fora",
    turnos: ["oi boa tarde", "Douglas", "quero uma churrasqueira com fogão", "sim, primeiro contato", "e aí?"],
    esperaFerramenta: "",
    proibeFerramenta: "enviar_catalogo",
    esperaTexto: /embutid.{0,120}(separad|do lado|ao lado|campeir)|campeir.{0,120}embutid/i,
  },
  {
    nome: "2. respondeu SEPARADO → manda o CATÁLOGO",
    turnos: ["oi boa tarde", "Douglas", "quero uma churrasqueira com fogão", "sim, primeiro contato",
             "quero o fogão campeiro separado, do lado", "pode mandar"],
    esperaFerramenta: "enviar_catalogo",
  },
  {
    nome: "3. respondeu EMBUTIDO → apresenta os poucos modelos, sem catálogo",
    turnos: ["oi boa tarde", "Douglas", "quero uma churrasqueira com fogão", "sim, primeiro contato",
             "quero embutido, dentro da churrasqueira mesmo", "qual tu indica?"],
    esperaFerramenta: "",
    proibeFerramenta: "enviar_catalogo",
    esperaTexto: /tradi[çc][ãa]o gourmet|gourmet/i,
    proibeTexto: /parrilla/i,
  },
  {
    nome: "4. modelo nomeado → FOTO (não pode ter quebrado)",
    turnos: ["oi boa tarde", "Marcos", "quero a gourmet com fogão 4 bocas", "sim, é meu primeiro contato", "pode mandar"],
    esperaFerramenta: "enviar_foto",
  },
  {
    nome: "5. produto único → PERGUNTA modelo ou catálogo (não pode ter quebrado)",
    turnos: ["oi boa tarde", "Rita", "quero uma churrasqueira", "sim, primeiro contato", "pode mandar"],
    esperaFerramenta: "",
    esperaTexto: /modelo espec[íi]fico|cat[áa]logo completo/i,
  },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  let falhas = 0;

  const filtro = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const pausa = Number(process.env.PAUSA_MS ?? 0);
  for (const c of CASOS) {
    if (filtro.length && !filtro.includes(Number(c.nome[0]))) continue;
    console.log(`\n${"=".repeat(76)}\n### ${c.nome}`);
    const transcript: ChatMessage[] = [];
    const ficha: Record<string, unknown> = {};
    const ferramentas: string[] = [];
    let ultima = "";
    let viuVideo = -1, viuCatalogo = -1;

    for (const t of c.turnos) {
      if (pausa) await new Promise((r) => setTimeout(r, pausa));
      transcript.push({ role: "user", content: t });
      let reply = "";
      try {
        const out = await runAgent(
          { clientId: CLIENTE, connectionId: "sim", contact: { id: `sim-conj-${c.nome.slice(0, 3)}`, name: null, waId: "0000000000" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? "";
        for (const tc of out.toolCalls ?? []) {
          const nome = (tc as { name?: string })?.name ?? "";
          if (nome) {
            ferramentas.push(nome);
            if (nome === "enviar_video" && viuVideo < 0) viuVideo = ferramentas.length;
            if (nome === "enviar_catalogo" && viuCatalogo < 0) viuCatalogo = ferramentas.length;
          }
        }
      } catch (e) { reply = `[ERRO: ${String((e as Error)?.message ?? e).slice(0, 110)}]`; }
      transcript.push({ role: "assistant", content: reply });
      ultima += "\n" + reply;
      console.log(`\nLEAD: ${t}`);
      console.log(`IA  : ${reply.replace(/\n/g, " ").slice(0, 240)}`);
    }

    console.log(`\n  ferramentas: ${ferramentas.length ? ferramentas.join(" → ") : "nenhuma"}`);
    if (c.esperaFerramenta) {
      const ok = ferramentas.includes(c.esperaFerramenta);
      if (!ok) falhas++;
      console.log(`  ${ok ? "✓" : "✗"} chamou ${c.esperaFerramenta}`);
    }
    if (c.proibeFerramenta) {
      const ok = !ferramentas.includes(c.proibeFerramenta);
      if (!ok) falhas++;
      console.log(`  ${ok ? "✓" : "✗"} NÃO chamou ${c.proibeFerramenta}`);
    }
    if (c.esperaTexto) {
      const ok = c.esperaTexto.test(ultima);
      if (!ok) falhas++;
      console.log(`  ${ok ? "✓" : "✗"} disse o que devia (${c.esperaTexto})`);
    }
    if (c.proibeTexto) {
      const ok = !c.proibeTexto.test(ultima);
      if (!ok) falhas++;
      console.log(`  ${ok ? "✓" : "✗"} NÃO disse o proibido (${c.proibeTexto})`);
    }
    if (viuVideo > 0 && viuCatalogo > 0) {
      const ok = viuVideo < viuCatalogo;
      if (!ok) falhas++;
      console.log(`  ${ok ? "✓" : "✗"} vídeo veio ANTES do catálogo`);
    }
  }

  console.log(`\n${"=".repeat(76)}\n${falhas === 0 ? "todos os casos passaram" : `${falhas} problema(s)`}`);
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
