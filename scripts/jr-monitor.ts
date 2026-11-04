/**
 * Plantão diário da JR enquanto a IA roda sozinha (31/10 a 03/11/2026).
 *
 * A equipe só volta na terça. Com `answerMode: "always"` e corte em
 * `atendeDesde`, a IA atende sem ninguém olhando — então este script olha.
 *
 * O que ele procura, nesta ordem de gravidade:
 *   1. a conexão morreu de novo (foi o que custou 21 dias em outubro);
 *   2. erro de turno — a IA tentou e falhou;
 *   3. lead atendido que NÃO devia (corte furado);
 *   4. lead novo que ficou sem resposta;
 *   5. gasto do dia contra o teto.
 *
 * Uso:
 *   railway run --service Postgres bash -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL";
 *     npx tsx scripts/jr-monitor.ts [--horas 24]'
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

(async () => {
  const horas = Number(arg("horas", "24"));
  const desde = new Date(Date.now() - horas * 3600e3);
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: c!.id },
    select: { answerMode: true, atendeDesde: true, enabled: true, paused: true, status: true, dailyUsdCap: true } });
  const conns = await prisma.waConnection.findMany({ where: { clientId: c!.id }, select: { id: true, displayPhone: true, lastEventAt: true } });
  const ids = conns.map((x) => x.id);
  const alertas: string[] = [];

  console.log(`\n═══ ${c!.name} — plantão · últimas ${horas}h ═══`);
  console.log(`  modo ${cfg?.answerMode} · corte ${cfg?.atendeDesde?.toISOString().slice(0,16) ?? "nenhum"} · ligada=${cfg?.enabled} pausada=${cfg?.paused}`);

  // 1. A conexão está viva?
  for (const x of conns) {
    const h = x.lastEventAt ? (Date.now() - x.lastEventAt.getTime()) / 3600e3 : Infinity;
    const txt = `${x.displayPhone ?? x.id}: último evento há ${h === Infinity ? "nunca" : h.toFixed(1) + "h"}`;
    console.log(`  ${h > 12 ? "⚠️ " : "   "}${txt}`);
    if (h > 12) alertas.push(`CONEXÃO MUDA — ${txt}`);
  }

  // 2. Turnos e erros
  const t = await prisma.aiInteraction.findMany({ where: { clientId: c!.id, createdAt: { gte: desde } },
    select: { status: true, decision: true, contactId: true, tokensIn: true, latencyMs: true, error: true, guardrails: true } });
  const erros = t.filter((x) => x.status === "error");
  console.log(`\n  turnos: ${t.length} · erros: ${erros.length}`);
  if (erros.length) {
    alertas.push(`${erros.length} turno(s) com ERRO`);
    for (const e of erros.slice(0, 5)) console.log(`     ✗ ${e.decision ?? "—"}: ${String(e.error ?? "").slice(0, 130)}`);
  }
  const lat = t.map((x) => x.latencyMs).filter((v) => v > 0).sort((a, b) => a - b);
  if (lat.length) console.log(`  resposta: mediana ${(lat[lat.length>>1]/1000).toFixed(1)}s · p90 ${(lat[Math.floor(.9*lat.length)]/1000).toFixed(1)}s`);

  // 3. O corte está sendo respeitado?
  if (cfg?.atendeDesde) {
    const atendidos = [...new Set(t.filter((x) => x.tokensIn > 0).map((x) => x.contactId).filter((x): x is string => !!x))];
    if (atendidos.length) {
      const furos = await prisma.waContact.count({ where: { id: { in: atendidos }, createdAt: { lt: cfg.atendeDesde } } });
      console.log(`  leads atendidos: ${atendidos.length} · ANTIGOS atendidos indevidamente: ${furos}`);
      if (furos > 0) alertas.push(`CORTE FUROU — ${furos} lead(s) antigo(s) foram atendidos`);
    } else console.log(`  leads atendidos: 0`);
  }

  // 4. Lead novo que entrou e ficou sem resposta
  const novos = await prisma.waContact.findMany({
    where: { connectionId: { in: ids }, createdAt: { gte: cfg?.atendeDesde ?? desde } }, select: { id: true } });
  const idsNovos = novos.map((x) => x.id);
  const semResposta = idsNovos.length ? await prisma.waConversation.count({
    where: { contactId: { in: idsNovos }, lastInboundAt: { not: null }, OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: prisma.waConversation.fields.lastInboundAt } }] },
  }).catch(() => -1) : 0;
  console.log(`  leads novos desde o corte: ${idsNovos.length} · sem resposta: ${semResposta < 0 ? "(n/d)" : semResposta}`);
  if (semResposta > 0) alertas.push(`${semResposta} lead(s) novo(s) sem resposta`);

  // 5. Gasto
  const gasto = await prisma.aiUsage.aggregate({ where: { clientId: c!.id, createdAt: { gte: desde } }, _sum: { costUsd: true } });
  const usd = gasto._sum.costUsd ?? 0;
  console.log(`  gasto: $${usd.toFixed(4)} (R$ ${(usd * 5.19).toFixed(2)}) · teto diário $${cfg?.dailyUsdCap ?? "—"}`);
  if (cfg?.dailyUsdCap && usd > cfg.dailyUsdCap * 0.7) alertas.push(`gasto em ${(100*usd/cfg.dailyUsdCap).toFixed(0)}% do teto`);

  // 6. Guardrails acionados
  const marcas = new Map<string, number>();
  for (const x of t) for (const g of ((x.guardrails as string[] | null) ?? [])) {
    const k = g.split(":").slice(0, 2).join(":"); marcas.set(k, (marcas.get(k) ?? 0) + 1);
  }
  if (marcas.size) {
    console.log(`\n  guardrails:`);
    for (const [k, n] of [...marcas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`     ${String(n).padStart(3)}  ${k}`);
  }

  console.log(`\n${alertas.length ? "  🔴 " + alertas.length + " ALERTA(S):" : "  ✅ nada a reportar"}`);
  for (const a of alertas) console.log(`     · ${a}`);
  console.log();
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
