/**
 * Valida o ciclo que a Maria desenhou, ponta a ponta, agora com os recortes no ar:
 *   "churrasqueira com fogão" → pergunta embutido ou separado
 *   → separado  → RECORTE dos conjuntos (não as 43 páginas)
 *   → embutido  → os modelos, sem catálogo
 * E que o catálogo completo continua saindo para quem pede "o catálogo".
 * Nada é enviado nem gravado.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const PAUSA = Number(process.env.PAUSA_MS ?? 3500);

type Caso = { nome: string; turnos: string[]; esperaCategoria?: string; proibeCatalogo?: boolean };

const CASOS: Caso[] = [
  {
    nome: "1. separado → RECORTE dos conjuntos",
    turnos: ["oi", "Douglas", "quero uma churrasqueira com fogão", "primeiro contato",
             "quero o fogão campeiro separado, do lado", "pode mandar"],
    esperaCategoria: "conjunto_fogao",
  },
  {
    nome: "2. embutido → sem catálogo nenhum",
    turnos: ["oi", "Douglas", "quero uma churrasqueira com fogão", "primeiro contato",
             "quero embutido, dentro da churrasqueira", "qual tu indica?"],
    proibeCatalogo: true,
  },
  {
    nome: "3. 'manda o catálogo' → o COMPLETO, como antes",
    turnos: ["oi", "Rita", "quero uma churrasqueira", "primeiro contato", "me manda o catálogo completo"],
    esperaCategoria: "churrasqueira",
  },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  let falhas = 0;
  for (const c of CASOS) {
    console.log(`\n${"=".repeat(76)}\n### ${c.nome}`);
    const transcript: ChatMessage[] = [];
    const ficha: Record<string, unknown> = {};
    const categorias: string[] = [];
    const artefatos: string[] = [];

    for (const t of c.turnos) {
      await new Promise((r) => setTimeout(r, PAUSA));
      transcript.push({ role: "user", content: t });
      let reply = "";
      try {
        const out = await runAgent(
          { clientId: CLIENTE, connectionId: "sim", contact: { id: `sim-rec-${c.nome[0]}`, name: null, waId: "0000000000" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? "";
        for (const tc of out.toolCalls ?? []) {
          const x = tc as { name?: string; args?: Record<string, unknown> };
          if (x?.name === "enviar_catalogo") categorias.push(String(x.args?.categoria ?? "(padrão)"));
        }
        for (const a of out.artifacts ?? []) if ((a as { kind?: string })?.kind === "pdf") artefatos.push(String((a as { url?: string }).url ?? "").split("/").pop() ?? "");
      } catch (e) { reply = `[ERRO: ${String((e as Error)?.message ?? e).slice(0, 90)}]`; }
      transcript.push({ role: "assistant", content: reply });
      console.log(`\nLEAD: ${t}`);
      console.log(`IA  : ${reply.replace(/\n/g, " ").slice(0, 230)}`);
    }

    console.log(`\n  enviar_catalogo: ${categorias.length ? categorias.join(", ") : "não chamou"}`);
    console.log(`  PDF enviado    : ${artefatos.length ? [...new Set(artefatos)].join(", ") : "nenhum"}`);
    if (c.esperaCategoria) {
      const ok = categorias.includes(c.esperaCategoria);
      if (!ok) falhas++;
      console.log(`  ${ok ? "✓" : "✗"} usou a categoria '${c.esperaCategoria}'`);
    }
    if (c.proibeCatalogo) {
      const ok = categorias.length === 0;
      if (!ok) falhas++;
      console.log(`  ${ok ? "✓" : "✗"} NÃO mandou catálogo`);
    }
  }
  console.log(`\n${"=".repeat(76)}\n${falhas === 0 ? "ciclo completo funcionando" : `${falhas} problema(s)`}`);
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
