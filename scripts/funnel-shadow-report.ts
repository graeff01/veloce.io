/**
 * Relatório do SHADOW do classificador de funil (motor novo LLM-first vs. funil atual).
 * 100% leitura sobre FunnelShadow. Mede o ganho ANTES de ligar de vez (FUNNEL_LLM_MODE=active).
 *
 * O que responde:
 *   • concordância motor-novo × etapa atual;
 *   • quantas vezes o motor novo EVITOU um avanço errado (léxico subiria, LLM segurou/rebaixou);
 *   • quantas vezes o motor novo PEGOU um avanço que o léxico perdeu (léxico calou, LLM avançou);
 *   • atividade do gate de confiança (quantos avanços segurados por baixa confiança);
 *   • custo acumulado por dia, latência e taxa de falha da LLM.
 *
 * Uso:
 *   railway run --service Postgres npx tsx scripts/funnel-shadow-report.ts [nomeCliente] [--days 7] [--list 25]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const raw = process.argv.slice(2);
let nameArg = "";
let days = 7;
let listN = 25;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === "--days") days = Number(raw[++i]);
  else if (a.startsWith("--days=")) days = Number(a.split("=")[1]);
  else if (a === "--list") listN = Number(raw[++i]);
  else if (a.startsWith("--list=")) listN = Number(a.split("=")[1]);
  else if (!a.startsWith("--")) nameArg = a;
}

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_PUBLIC_URL/DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const pct = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(1)}%` : "—");
const usd = (n: number) => `US$ ${n.toFixed(4)}`;
const RANK: Record<string, number> = { recebido: 0, respondido: 1, qualificado: 2, negociacao: 3, convertido: 4 };
const rank = (s: string | null) => (!s || s === "perdido" ? 0 : RANK[s] ?? 0);
const isAdvance = (from: string | null, to: string | null) => to !== "perdido" && rank(to) > rank(from);

async function main() {
  const since = new Date(Date.now() - days * 864e5);

  // Filtro por cliente (substring do nome). Sem arg → todos.
  let clientIds: string[] | null = null;
  let clientLabel = "TODOS os clientes";
  if (nameArg) {
    const clients = await prisma.client.findMany({
      where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true },
    });
    if (clients.length === 0) { console.error(`Nenhum cliente casa com "${nameArg}".`); process.exit(1); }
    clientIds = clients.map((c) => c.id);
    clientLabel = clients.map((c) => c.name).join(", ");
  }

  const rows = await prisma.funnelShadow.findMany({
    where: { createdAt: { gte: since }, ...(clientIds ? { clientId: { in: clientIds } } : {}) },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n═══ SHADOW DO FUNIL — ${clientLabel} — últimos ${days}d ═══`);
  console.log(`Avaliações: ${rows.length}${rows.length ? ` | contatos distintos: ${new Set(rows.map((r) => r.contactId)).size}` : ""}`);
  if (rows.length === 0) {
    console.log("\nSem dados. Confirme FUNNEL_LLM_MODE=shadow e que houve mensagens de lead na janela.\n");
    return;
  }

  // ── Saúde do motor: falha da LLM, gate, latência ──────────────────────────────
  const llmFailed = rows.filter((r) => r.source === "llm_failed").length;
  const withLatency = rows.filter((r) => r.latencyMs != null);
  const avgLat = withLatency.length ? Math.round(withLatency.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / withLatency.length) : 0;
  const gated = rows.filter((r) => r.gatedByConf).length;
  const confRows = rows.filter((r) => r.confidence != null);
  const avgConf = confRows.length ? Math.round(confRows.reduce((a, r) => a + (r.confidence ?? 0), 0) / confRows.length) : 0;

  console.log(`\n── Saúde do motor ──`);
  console.log(`  Falha/timeout da LLM: ${llmFailed} (${pct(llmFailed, rows.length)}) → caiu no piso, nunca ficou sem etapa`);
  console.log(`  Latência média LLM:   ${avgLat}ms`);
  console.log(`  Confiança média:      ${avgConf}/100`);
  console.log(`  Segurados pelo gate:  ${gated} (${pct(gated, rows.length)}) — avanço/perda que a LLM propôs mas < threshold`);

  // ── Concordância motor-novo × funil atual ─────────────────────────────────────
  const agree = rows.filter((r) => r.proposedStage === r.currentStage).length;
  const wouldChange = rows.filter((r) => r.wouldChange);
  console.log(`\n── Motor novo × funil atual ──`);
  console.log(`  Concorda com a etapa atual: ${agree} (${pct(agree, rows.length)})`);
  console.log(`  Mudaria a etapa:            ${wouldChange.length} (${pct(wouldChange.length, rows.length)})`);

  // ── O ponto central: divergência com o léxico-gatilho ─────────────────────────
  // "Evitou avanço errado": o léxico atual SUBIRIA (lexiconTriggered) mas o motor novo
  // NÃO avançou (segurou pelo gate, ou classificou perdido/igual/menor com contexto).
  const avoided = rows.filter((r) => r.lexiconTriggered && !isAdvance(r.currentStage, r.proposedStage));
  // "Pegou avanço perdido": o léxico calou, mas a LLM avançou com confiança.
  const caught = rows.filter((r) => !r.lexiconTriggered && r.source === "llm" && isAdvance(r.currentStage, r.proposedStage));

  console.log(`\n── Ganho vs. léxico atual (o motivo da mudança) ──`);
  console.log(`  ✔ Avanços ERRADOS evitados: ${avoided.length} — léxico subiria, motor novo segurou/rebaixou com contexto`);
  console.log(`  ✔ Avanços que o léxico PERDIA: ${caught.length} — léxico calou, motor novo avançou com evidência`);

  // ── Temperatura (motor novo vs. score determinístico atual) ───────────────────
  const withTemp = rows.filter((r) => r.llmTemp);
  if (withTemp.length) {
    const tAgree = rows.filter((r) => r.proposedTemp && r.proposedTemp === r.currentTemp).length;
    const tChange = rows.filter((r) => r.tempWouldChange);
    const tGated = rows.filter((r) => r.tempGatedByConf).length;
    const dist = withTemp.reduce((m, r) => { m[r.llmTemp!] = (m[r.llmTemp!] ?? 0) + 1; return m; }, {} as Record<string, number>);
    const PT: Record<string, string> = { hot: "🔥quente", warm: "🟡morno", cold: "🧊frio" };
    console.log(`\n── Temperatura (motor novo vs. score atual) ──`);
    console.log(`  Avaliações com temperatura: ${withTemp.length}`);
    console.log(`  Distribuição LLM: ${Object.entries(dist).map(([k, v]) => `${PT[k] ?? k}=${v}`).join("  ")}`);
    console.log(`  Concorda com o score atual: ${tAgree} | Mudaria: ${tChange.length} | Segurados pelo gate: ${tGated}`);
    for (const r of tChange.slice(0, 12)) {
      console.log(`   ${PT[r.currentTemp ?? ""] ?? (r.currentTemp ?? "∅")} → ${PT[r.proposedTemp ?? ""] ?? r.proposedTemp} (${r.tempConfidence ?? "—"}%)`);
      if (r.tempEvidence) console.log(`     └ "${r.tempEvidence}"`);
    }
  }

  // ── Custo acumulado por dia ───────────────────────────────────────────────────
  const byDay = new Map<string, { n: number; cost: number; tin: number; tout: number }>();
  for (const r of rows) {
    const d = r.createdAt.toISOString().slice(0, 10);
    const acc = byDay.get(d) ?? { n: 0, cost: 0, tin: 0, tout: 0 };
    acc.n++; acc.cost += r.costUsd ?? 0; acc.tin += r.tokensIn ?? 0; acc.tout += r.tokensOut ?? 0;
    byDay.set(d, acc);
  }
  const totalCost = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  console.log(`\n── Custo (gpt-4o-mini) ──`);
  console.log(`  Dia          Avals   Custo        Tokens(in/out)`);
  for (const [d, a] of [...byDay.entries()].sort()) {
    console.log(`  ${d}   ${String(a.n).padStart(5)}   ${usd(a.cost).padEnd(12)} ${a.tin}/${a.tout}`);
  }
  console.log(`  TOTAL ${days}d: ${usd(totalCost)} | projeção 30d ≈ ${usd((totalCost / days) * 30)}`);

  // ── Amostra de divergências para revisão humana ───────────────────────────────
  const sample = [...avoided, ...caught, ...wouldChange.filter((r) => !avoided.includes(r) && !caught.includes(r))].slice(0, listN);
  if (sample.length) {
    console.log(`\n── Amostra p/ revisão (${sample.length}) ──`);
    for (const r of sample) {
      const tag = avoided.includes(r) ? "EVITOU " : caught.includes(r) ? "PEGOU  " : "MUDOU  ";
      const conf = r.confidence != null ? `${r.confidence}%` : "—";
      const lex = r.lexiconTriggered ? "léxico↑" : "léxico·";
      console.log(`  [${tag}] ${r.currentStage ?? "∅"} → ${r.proposedStage ?? "∅"} | LLM=${r.llmStage ?? "—"}(${conf}) ${lex}`);
      if (r.evidence) console.log(`           evidência: "${r.evidence}"`);
    }
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
