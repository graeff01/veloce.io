/**
 * Bateria de avaliação da IA (golden dataset) — F0.
 *
 * Roda todos os casos de evals/cases/*.json pelo MESMO orquestrador (modo test,
 * sem gravar/enviar) contra a config real de um cliente, aplica as asserções
 * determinísticas e, se houver OPENAI_API_KEY, o juiz LLM. Sai com código != 0
 * se qualquer caso falhar — pronto para virar gate de CI ("não sobe se regrediu").
 *
 * Uso:
 *   AI_EVAL_CLIENT_ID=<clientId> npx tsx scripts/run-evals.ts
 *   npx tsx scripts/run-evals.ts --client <clientId> [--judge gpt-4o] [--json]
 *
 * Requer: DATABASE_URL e OPENAI_API_KEY no ambiente (o juiz é opcional).
 */
import "dotenv/config";
import { runEvals } from "@/lib/ai-agent/eval/runner";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const clientId = arg("client") ?? process.env.AI_EVAL_CLIENT_ID;
  if (!clientId) {
    console.error("Falta o cliente. Use --client <id> ou AI_EVAL_CLIENT_ID=<id>.");
    process.exit(2);
  }

  // Juiz LLM: só roda se houver chave. Modelo forte por padrão (avalia melhor).
  const wantJudge = !process.argv.includes("--no-judge");
  const judgeModel = wantJudge && process.env.OPENAI_API_KEY
    ? (arg("judge") ?? process.env.AI_EVAL_JUDGE_MODEL ?? "gpt-4o")
    : null;

  const report = await runEvals({ clientId, judgeModel });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nBateria de avaliação — cliente ${clientId}`);
    console.log(`Juiz LLM: ${judgeModel ?? "desligado (sem OPENAI_API_KEY ou --no-judge)"}\n`);
    for (const c of report.casos) {
      console.log(`${c.passou ? "PASS ✔" : "FAIL ✘"}  ${c.id} — ${c.descricao}`);
      if (!c.passou) {
        if (c.erro) console.log(`      erro: ${c.erro}`);
        for (const ch of c.checks.filter((x) => !x.passou)) {
          console.log(`      ✗ ${ch.nome}${ch.detalhe ? ` (${ch.detalhe})` : ""}`);
        }
        if (c.judge && !c.judge.passou) console.log(`      ✗ juiz: ${c.judge.motivo}`);
      }
    }
    console.log(`\n${report.passaram}/${report.total} passaram · ${report.falharam} falharam · ${report.durationMs}ms\n`);
  }

  process.exit(report.falharam > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
