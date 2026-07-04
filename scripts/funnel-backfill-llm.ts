/**
 * Backfill do funil pelo motor NOVO (LLM + contexto): reclassifica as conversas
 * abertas pra que, ao ligar FUNNEL_LLM_MODE=active, o painel INTEIRO já apareça
 * correto — não só os leads que mandarem mensagem depois.
 *
 * DRY-RUN por padrão (só mostra o que mudaria). Use --apply pra GRAVAR.
 * Respeita todas as regras de ouro (reusa decideStage): manual, terminais, exclusão.
 *
 * Uso:
 *   railway run --service Postgres npx tsx scripts/funnel-backfill-llm.ts [nomeCliente] [--apply] [--limit 50]
 */
import { prismaUnscoped } from "@/lib/prisma";
import { backfillFunnelLLM } from "@/lib/ai-agent/funnel-shadow";

const raw = process.argv.slice(2);
let nameArg = "";
let apply = false;
let limit: number | undefined;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === "--apply") apply = true;
  else if (a === "--limit") limit = Number(raw[++i]);
  else if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  else if (!a.startsWith("--")) nameArg = a;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY ausente — o backfill precisa da LLM."); process.exit(1); }

  // Resolve as conexões (por nome do cliente, ou todas).
  const conns = await prismaUnscoped.waConnection.findMany({
    where: nameArg ? { client: { name: { contains: nameArg, mode: "insensitive" } } } : {},
    select: { id: true, client: { select: { name: true } } },
  });
  if (conns.length === 0) { console.error(`Nenhuma conexão de WhatsApp para "${nameArg || "(todos)"}".`); process.exit(1); }

  console.log(`\n═══ BACKFILL DO FUNIL (LLM) — ${apply ? "APLICANDO ✍️" : "DRY-RUN 👀"} ═══`);
  let totalChanges = 0, totalApplied = 0, totalCost = 0, totalScanned = 0;

  for (const conn of conns) {
    const r = await backfillFunnelLLM({ connectionId: conn.id, apply, limit });
    totalScanned += r.scanned; totalChanges += r.changes.length; totalApplied += r.applied; totalCost += r.costUsd;
    console.log(`\n▸ ${conn.client?.name ?? conn.id}: ${r.scanned} conversas | ${r.changes.length} mudariam${apply ? ` | ${r.applied} aplicadas` : ""} | US$ ${r.costUsd.toFixed(4)}`);
    for (const c of r.changes.slice(0, 40)) {
      const conf = c.confidence != null ? ` (${c.confidence}%)` : "";
      console.log(`   ${(c.name ?? c.contactId).padEnd(22).slice(0, 22)} ${c.from ?? "∅"} → ${c.to}${conf}`);
      if (c.evidence) console.log(`     └ "${c.evidence}"`);
    }
    if (r.changes.length > 40) console.log(`   … +${r.changes.length - 40} outras`);
  }

  console.log(`\n── TOTAL: ${totalScanned} conversas | ${totalChanges} mudariam${apply ? ` | ${totalApplied} aplicadas` : ""} | custo US$ ${totalCost.toFixed(4)} ──`);
  if (!apply && totalChanges > 0) console.log(`Revise acima e rode de novo com --apply pra gravar.\n`);
  else console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prismaUnscoped.$disconnect());
