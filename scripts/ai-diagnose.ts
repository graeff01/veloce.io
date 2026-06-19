/**
 * Diagnóstico: por que a IA não respondeu? Mostra config, mensagens recebidas
 * recentes, jobs na fila, interações da IA, uso e eventos de erro. 100% leitura.
 * Uso: railway run --service Postgres npx tsx scripts/ai-diagnose.ts [nomeCliente]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const nameArg = process.argv[2] || "boqueir";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

(async () => {
  const client = await prisma.client.findFirst({ where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.log(`Cliente "${nameArg}" não encontrado`); return; }
  const conns = await prisma.waConnection.findMany({ where: { clientId: client.id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);
  console.log(`\n═══ ${client.name} ═══`);

  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: client.id } });
  console.log("\n── CONFIG DA IA ──");
  if (!cfg) console.log("  ❌ SEM CONFIG (nunca salva) → a IA não atua.");
  else {
    console.log(`  enabled: ${cfg.enabled}  ·  status: ${cfg.status}  ·  paused: ${cfg.paused}`);
    console.log(`  scopeMode: ${cfg.scopeMode}  ·  testMode(canário): ${cfg.testMode}  ·  testNumbers: ${JSON.stringify(cfg.testNumbers)}`);
    console.log(`  businessHours: ${JSON.stringify(cfg.businessHours)}`);
    console.log(`  timezone: ${cfg.timezone}  ·  disclosure: ${cfg.disclosureEnabled}  ·  dailyUsdCap: ${cfg.dailyUsdCap}`);
  }
  console.log(`  env AI_AGENT_KILL: ${process.env.AI_AGENT_KILL ?? "(não setado)"}  ·  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "presente" : "AUSENTE"}`);

  const now = new Date();
  console.log(`\n  Agora (UTC): ${now.toISOString()}  ·  hora BRT aprox: ${(now.getUTCHours() - 3 + 24) % 24}h`);

  const msgs = await prisma.waMessage.findMany({ where: { connectionId: { in: connIds }, direction: "in" }, orderBy: { timestamp: "desc" }, take: 6, select: { text: true, type: true, timestamp: true, contactId: true } });
  console.log("\n── ÚLTIMAS MENSAGENS RECEBIDAS ──");
  if (msgs.length === 0) console.log("  ❌ Nenhuma mensagem recebida (o webhook não registrou nada).");
  for (const m of msgs) console.log(`  ${m.timestamp.toISOString()} [${m.type}] ${(m.text || "").slice(0, 60)}`);

  const jobs = await prisma.aiJob.findMany({ where: { clientId: client.id }, orderBy: { updatedAt: "desc" }, take: 5 });
  console.log("\n── FILA (AiJob) ──");
  if (jobs.length === 0) console.log("  (vazia — nada pendente)");
  for (const j of jobs) console.log(`  status=${j.status} attempts=${j.attempts} runAfter=${j.runAfter.toISOString()} lastError=${j.lastError ?? "-"}`);

  const inter = await prisma.aiInteraction.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, decision: true, status: true, inbound: true, outbound: true } });
  console.log("\n── INTERAÇÕES DA IA (respostas geradas) ──");
  if (inter.length === 0) console.log("  ❌ Nenhuma — a IA NUNCA chegou a gerar resposta.");
  for (const i of inter) console.log(`  ${i.createdAt.toISOString()} decision=${i.decision} status=${i.status} in="${(i.inbound||"").slice(0,30)}" out="${(i.outbound||"").slice(0,40)}"`);

  const usage = await prisma.aiUsage.aggregate({ where: { clientId: client.id }, _sum: { costUsd: true }, _count: { _all: true } });
  console.log(`\n── USO OPENAI ── chamadas: ${usage._count._all}  ·  custo total: US$ ${(usage._sum.costUsd ?? 0).toFixed(4)}`);

  const errs = await prisma.waEvent.findMany({ where: { connectionId: { in: connIds }, type: "integration.error" }, orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, data: true } }).catch(() => []);
  console.log("\n── EVENTOS DE ERRO (integration.error) ──");
  if (!errs.length) console.log("  (nenhum)");
  for (const e of errs as { createdAt: Date; data: unknown }[]) console.log(`  ${e.createdAt.toISOString()} ${JSON.stringify(e.data)}`);

  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
