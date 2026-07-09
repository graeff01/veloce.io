/**
 * Online eval (F3): amostra respostas reais recentes ainda sem nota e grava
 * qualityScore (0..1) via juiz LLM. Alimenta a tendência de qualidade no painel.
 *
 * Uso:
 *   AI_EVAL_CLIENT_ID=<clientId> npx tsx scripts/score-production.ts [--limit 30] [--days 7]
 *
 * Requer DATABASE_URL e OPENAI_API_KEY. Ideal em cron (ex: 1x/dia).
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { scoreReply } from "@/lib/ai-agent/eval/online-score";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const clientId = arg("client") ?? process.env.AI_EVAL_CLIENT_ID;
  if (!clientId) { console.error("Falta o cliente. Use --client <id> ou AI_EVAL_CLIENT_ID."); process.exit(2); }
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária para o juiz."); process.exit(2); }
  const limit = Number(arg("limit") ?? 30);
  const days = Number(arg("days") ?? 7);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const model = process.env.AI_EVAL_JUDGE_MODEL ?? "gpt-4o";

  const rows = await prisma.aiInteraction.findMany({
    where: { clientId, createdAt: { gte: since }, qualityScore: null, inbound: { not: null }, outbound: { not: null }, status: "ok" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, inbound: true, outbound: true },
  });

  let scored = 0;
  let sum = 0;
  for (const r of rows) {
    const res = await scoreReply(model, r.inbound!, r.outbound!);
    if (!res) continue;
    await prisma.aiInteraction.update({ where: { id: r.id }, data: { qualityScore: res.score } }).catch(() => {});
    scored++; sum += res.score;
  }

  console.log(`\n${scored}/${rows.length} avaliadas · média ${scored ? (sum / scored).toFixed(2) : "—"} (0..1)\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
