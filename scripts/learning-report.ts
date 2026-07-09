/**
 * L3 — relatório de aprendizado: qual abordagem (variante A/B) realmente CONVERTE,
 * cruzando cada conversa com o desfecho real (venda confirmada / funil).
 *
 * Uso:
 *   AI_EVAL_CLIENT_ID=<clientId> npx tsx scripts/learning-report.ts [--days 30]
 *
 * Requer DATABASE_URL. Read-only — não altera nada.
 */
import "dotenv/config";
import { learnFromOutcomes } from "@/lib/ai-agent/learning";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const clientId = arg("client") ?? process.env.AI_EVAL_CLIENT_ID;
  if (!clientId) { console.error("Falta o cliente. Use --client <id> ou AI_EVAL_CLIENT_ID."); process.exit(2); }
  const days = Number(arg("days") ?? 30);

  const r = await learnFromOutcomes(clientId, days);
  console.log(`\nAprendizado — cliente ${clientId} · ${days} dias · ${r.totalConversations} conversas\n`);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  console.log("variante".padEnd(18), "conv".padStart(5), "qualif%".padStart(8), "venda%".padStart(7), "  (won/qual/lost/open)");
  for (const v of r.variants) {
    console.log(
      v.variant.slice(0, 17).padEnd(18),
      String(v.total).padStart(5),
      pct(v.qualifyRate).padStart(8),
      pct(v.winRate).padStart(7),
      `  (${v.won}/${v.qualified}/${v.lost}/${v.open})`,
    );
  }
  console.log(`\n${r.leader ? `🏆 Líder: ${r.leader.variant} (${pct(r.leader.rate)} qualif.)` : "Sem líder ainda."}`);
  console.log(`→ ${r.note}\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
