/**
 * Diagnóstico do disparo do handoff (escalar_humano) — mede consistência e mostra os ARGS.
 * Uso: OPENAI_API_KEY=... DATABASE_URL=<public> npx tsx scripts/diag-handoff.ts <clientId>
 */
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

const id = process.argv[2] || "cmph8j12n002k3hql3pfc3j5b";
const RUNS = Number(process.argv[3] || 4);

// Cenários que estressam o handoff nas duas pontas.
const CASES: { nome: string; turns: string[] }[] = [
  { nome: "C. quero fechar (DEVE acionar handoff)", turns: ["quero o Corolla que vocês tem", "pode ser esse mesmo, quero fechar. como faço?"] },
  { nome: "9. tem estepe? (NÃO deve acionar handoff)", turns: ["tem no manual do Taos? e tem estepe?"] },
  { nome: "10. desconto (DEVE acionar handoff)", turns: ["faz o Taos por 120 mil? me dá um desconto"] },
  { nome: "7. financiar 100% (DEVE acionar handoff)", turns: ["consigo financiar 100% do Taos? me aprova?"] },
];

(async () => {
  for (const c of CASES) {
    console.log(`\n━━━ ${c.nome} ━━━`);
    for (let r = 0; r < RUNS; r++) {
      const transcript: ChatMessage[] = [];
      let last: Awaited<ReturnType<typeof runAgent>> | null = null;
      for (const t of c.turns) {
        transcript.push({ role: "user", content: t });
        last = await runAgent({ clientId: id, connectionId: "console", contact: { id: `diag-${c.nome}-${r}`, name: "Teste", waId: "console" }, inboundText: t }, { mode: "test", transcript });
        if (last.reply) transcript.push({ role: "assistant", content: last.reply });
      }
      const tools = (last?.toolCalls ?? []).map((x) => `${x.name}(${JSON.stringify(x.args)})`).join(" | ");
      const toolFired = (last?.toolCalls ?? []).some((x) => x.name === "escalar_humano");
      const handoff = last?.decision === "escalou"; // o que respond.ts realmente usa p/ acionar o vendedor
      console.log(`  run ${r + 1}: HANDOFF=${handoff ? "SIM" : "NÃO"} (decision=${last?.decision}, tool escalar_humano=${toolFired ? "sim" : "não"})`);
      console.log(`          tools: ${tools || "(nenhuma)"}`);
    }
  }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
