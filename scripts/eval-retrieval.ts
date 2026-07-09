/**
 * Eval de retrieval (RAG) — mede hit@k e MRR contra a base de conhecimento real.
 *
 * Uso:
 *   AI_EVAL_CLIENT_ID=<clientId> npx tsx scripts/eval-retrieval.ts
 *   npx tsx scripts/eval-retrieval.ts --client <clientId> --k 3
 *
 * Casos em evals/retrieval/*.json. Requer DATABASE_URL e OPENAI_API_KEY (embeddings).
 */
import "dotenv/config";
import { join } from "node:path";
import { runRetrievalEval } from "@/lib/ai-agent/eval/retrieval";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const clientId = arg("client") ?? process.env.AI_EVAL_CLIENT_ID;
  if (!clientId) { console.error("Falta o cliente. Use --client <id> ou AI_EVAL_CLIENT_ID."); process.exit(2); }
  const k = Number(arg("k") ?? 3);

  const report = await runRetrievalEval(clientId, join(process.cwd(), "evals", "retrieval"), k);

  console.log(`\nEval de retrieval — cliente ${clientId} · k=${report.k}\n`);
  for (const c of report.casos) {
    console.log(`${c.hit ? `HIT  (rank ${c.rank})` : "MISS       "}  ${c.id} — "${c.query}"`);
    if (c.faltou.length) console.log(`      faltou: ${c.faltou.join(", ")}`);
  }
  console.log(`\nhit@${report.k}: ${(report.hitRate * 100).toFixed(0)}%  ·  MRR: ${report.mrr}  ·  ${report.hits}/${report.total}\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
