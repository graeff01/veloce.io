/** Verifica as 4 respostas da Maria (17/09) contra a IA. Nada é enviado nem gravado. */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const PAUSA = Number(process.env.PAUSA_MS ?? 3500);

type Caso = { nome: string; turnos: string[]; espera?: RegExp; proibe?: RegExp };

const CASOS: Caso[] = [
  {
    nome: "1. Parrilla PODE formar conjunto com fogão (erro meu, corrigido)",
    turnos: ["oi", "Douglas", "quero a parrilla 105 com um fogão campeiro de 4 bocas do lado"],
    proibe: /n[ãa]o (temos|existe|trabalhamos)|n[ãa]o (é|e) poss[íi]vel|n[ãa]o d[áa] para|infelizmente n[ãa]o|sem fog[ãa]o/i,
  },
  {
    nome: "2. 'fogão a gás' → Gourmet, SEM oferecer a Supreme",
    turnos: ["oi", "Douglas", "quero uma churrasqueira com fogão a gás embutido"],
    espera: /gourmet/i,
    proibe: /supreme/i,
  },
  {
    nome: "2b. rotativa/automatizada → AÍ SIM a Supreme",
    turnos: ["oi", "Douglas", "vocês tem churrasqueira rotativa, que gira sozinha?"],
    espera: /supreme/i,
  },
  {
    nome: "3. embutido → as TRÊS (Tradição, Tradição Gourmet, Gourmet)",
    turnos: ["oi", "Douglas", "quero churrasqueira com fogão embutido, quais tem?"],
    espera: /tradi[çc][ãa]o/i,
    proibe: /parrilla/i,
  },
  {
    nome: "4. fala 'fogão a gás', não 'bifeteira'",
    turnos: ["oi", "Douglas", "me explica a gourmet"],
    espera: /fog[ãa]o a g[áa]s/i,
    proibe: /bifeteira/i,
  },
  {
    // O acessório de 26x26 é outra coisa — não pode sumir nem virar "fogão".
    nome: "4b. o acessório bifeteira 26x26 continua existindo",
    turnos: ["oi", "Douglas", "quais acessórios tem pra tradição gourmet?"],
    espera: /26\s?x\s?26|bifeteira/i,
  },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  let falhas = 0;
  const filtro = process.argv.slice(2);
  for (const c of CASOS) {
    if (filtro.length && !filtro.some((f) => c.nome.startsWith(f))) continue;
    console.log(`\n${"=".repeat(76)}\n### ${c.nome}`);
    const transcript: ChatMessage[] = [];
    const ficha: Record<string, unknown> = {};
    let ultima = "";
    for (const t of c.turnos) {
      await new Promise((r) => setTimeout(r, PAUSA));
      transcript.push({ role: "user", content: t });
      let reply = "";
      try {
        const out = await runAgent(
          { clientId: CLIENTE, connectionId: "sim", contact: { id: `sim-maria-${c.nome.slice(0, 4)}`, name: null, waId: "0000000000" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? "";
      } catch (e) { reply = `[ERRO: ${String((e as Error)?.message ?? e).slice(0, 90)}]`; }
      transcript.push({ role: "assistant", content: reply });
      ultima = reply;
      console.log(`\nLEAD: ${t}`);
      console.log(`IA  : ${reply.replace(/\n/g, " ").slice(0, 300)}`);
    }
    if (c.espera) { const ok = c.espera.test(ultima); if (!ok) falhas++; console.log(`\n  ${ok ? "✓" : "✗"} disse o que devia (${c.espera})`); }
    if (c.proibe) { const ok = !c.proibe.test(ultima); if (!ok) falhas++; console.log(`  ${ok ? "✓" : "✗"} NÃO disse o proibido (${c.proibe})`); }
  }
  console.log(`\n${"=".repeat(76)}\n${falhas === 0 ? "todos passaram" : `${falhas} problema(s)`}`);
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
