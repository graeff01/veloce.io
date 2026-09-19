/**
 * Caça as lacunas que sobraram no fluxo do fogão/catálogo — os caminhos que
 * ninguém exercitou ainda. Objetivo: achar onde ainda cabe erro ANTES do
 * automático, não depois.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const PAUSA = Number(process.env.PAUSA_MS ?? 3500);

type Caso = { nome: string; turnos: string[]; nota: string };

const CASOS: Caso[] = [
  { nome: "A. 'fogão a lenha' sozinho — o conhecimento manda PERGUNTAR (a lenha existe nos dois)",
    turnos: ["oi", "Ana", "quero uma churrasqueira com fogão a lenha"],
    nota: "esperado: pergunta embutido ou separado. É a frase MAIS comum no tráfego real." },
  { nome: "B. só os fogões avulsos → devia usar o recorte 'fogoes'",
    turnos: ["oi", "Bruno", "quero ver só os fogões campeiros que vocês têm"],
    nota: "esperado: recorte fogoes, não o catálogo inteiro" },
  { nome: "C. pias/complementos → devia usar 'complementos'",
    turnos: ["oi", "Carla", "vocês têm pia e bancada pra área gourmet?"],
    nota: "esperado: recorte complementos" },
  { nome: "D. conjunto NOMEADO → foto, não catálogo (fraqueza conhecida)",
    turnos: ["oi", "Diego", "quero a gourmet com fogão 4 bocas", "primeiro contato", "pode mandar"],
    nota: "o prompt usa ESSE exemplo na regra da foto e ela não obedecia" },
  { nome: "E. lareira continua funcionando (não pode ter quebrado)",
    turnos: ["oi", "Elza", "vocês têm lareira? manda o catálogo"],
    nota: "esperado: catálogo de lareiras" },
  { nome: "F. pede fogão E lareira — dois produtos diferentes",
    turnos: ["oi", "Fabio", "quero uma churrasqueira com fogão e também uma lareira"],
    nota: "não pode misturar nem se perder" },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  for (const c of CASOS) {
    console.log(`\n${"=".repeat(78)}\n### ${c.nome}\n    ${c.nota}`);
    const transcript: ChatMessage[] = [];
    const ficha: Record<string, unknown> = {};
    const ferramentas: string[] = [];
    for (const t of c.turnos) {
      await new Promise((r) => setTimeout(r, PAUSA));
      transcript.push({ role: "user", content: t });
      let reply = "";
      try {
        const out = await runAgent(
          { clientId: CLIENTE, connectionId: "sim", contact: { id: `sim-lac-${c.nome[0]}`, name: null, waId: "0000000000" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? "";
        for (const tc of out.toolCalls ?? []) {
          const x = tc as { name?: string; args?: Record<string, unknown> };
          if (x?.name) ferramentas.push(x.name === "enviar_catalogo" ? `enviar_catalogo(${x.args?.categoria ?? "padrão"})` : x.name);
        }
      } catch (e) { reply = `[ERRO: ${String((e as Error)?.message ?? e).slice(0, 80)}]`; }
      transcript.push({ role: "assistant", content: reply });
      console.log(`\nLEAD: ${t}`);
      console.log(`IA  : ${reply.replace(/\n/g, " ").slice(0, 250)}`);
    }
    console.log(`\n  ferramentas: ${ferramentas.length ? ferramentas.join(" → ") : "nenhuma"}`);
  }
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
