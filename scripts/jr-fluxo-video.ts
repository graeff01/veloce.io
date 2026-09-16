/**
 * Reproduz o caminho exato do lead Lucas (16/09) e verifica se a IA faz a
 * pergunta de "primeiro contato" antes de apresentar modelos.
 *
 * Nada é enviado nem gravado (mode:"test").
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

// Os turnos do Lucas, na ordem em que ele escreveu.
const CAMINHOS: { nome: string; turnos: string[] }[] = [
  { nome: "Lucas (produto só aparece no 3º turno)",
    turnos: ["Ola bom dia", "Gostaria de modelos e valores", "Lucas", "Churrasqueira com fogao"] },
  { nome: "produto logo na abertura",
    turnos: ["oi, quanto custa a churrasqueira gourmet?", "Marcos"] },
  { nome: "dúvida técnica de verdade (a flexibilidade deve valer)",
    turnos: ["boa tarde", "Ana", "vocês instalam a churrasqueira?"] },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }

  for (const c of CAMINHOS) {
    console.log(`\n${"=".repeat(74)}\n### ${c.nome}`);
    const transcript: ChatMessage[] = [];
    const ficha: Record<string, unknown> = {};
    let perguntou = false, mandouVideo = false;

    for (const t of c.turnos) {
      transcript.push({ role: "user", content: t });
      let reply = "", tools: string[] = [];
      try {
        const out = await runAgent(
          { clientId: CLIENTE, connectionId: "sim", contact: { id: `sim-fluxo-${c.nome}`, name: null, waId: "0000000000" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? "";
        tools = (out.toolCalls ?? []).map((x) => x.name);
      } catch (e) { reply = `[ERRO: ${String((e as Error)?.message ?? e).slice(0, 90)}]`; }
      transcript.push({ role: "assistant", content: reply });
      if (/primeiro contato/i.test(reply)) perguntou = true;
      if (tools.includes("enviar_video")) mandouVideo = true;
      console.log(`\nLEAD: ${t}`);
      console.log(`IA  : ${reply.replace(/\n/g, " ").slice(0, 230)}`);
      if (tools.length) console.log(`  → ${tools.join(", ")}`);
    }
    console.log(`\n  perguntou "primeiro contato"? ${perguntou ? "SIM" : "NÃO"}`);
    console.log(`  chamou enviar_video?          ${mandouVideo ? "SIM" : "não (espera a resposta do lead)"}`);
  }
  await prismaUnscoped.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
