/**
 * Projeção de custo total — IA + Meta — a partir de dado REAL de produção.
 *
 * Mede os últimos 30 dias, descontando os números da bateria de QA (5551900*),
 * e projeta para o volume que você passar em --leads (padrão 1400).
 *
 * O custo de chat sai de AiInteraction turno a turno (tokensIn já soma o loop de
 * tools, e só grava em mode="live": replay/simulação não entram). O custo da Meta
 * sai da contagem de mensagens de saída, separando as que caem na janela gratuita
 * de 7 dias aberta por anúncio (Free Entry Point) das cobradas.
 *
 * Uso:
 *   railway run --service Postgres bash -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL";
 *     npx tsx scripts/custo-total.ts --cliente jr --leads 1400'
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const ALVO = Number(arg("leads", "1400"));
const BRL = Number(arg("dolar", "5.19"));
// Tarifas Meta (Brasil, BRL). CONFIRME na fatura — a de serviço é a menos certa.
const TARIFA_SERVICO = Number(arg("tarifa", "0.035"));
const FRANQUIA = 1000; // mensagens de serviço grátis por NÚMERO por mês (desde 01/10/2026)
const FEP_DIAS = 7;    // janela gratuita aberta por lead vindo de anúncio

const PRECO: Record<string, { in: number; out: number; cachedIn: number }> = {
  "gpt-4.1-mini": { in: 0.4, out: 1.6, cachedIn: 0.10 },
  "gpt-4o-mini": { in: 0.15, out: 0.60, cachedIn: 0.075 },
};
const custoChat = (m: string, tin: number, tout: number, cache: number) => {
  const p = PRECO[m] ?? PRECO["gpt-4o-mini"];
  const c = tin * cache;
  return ((tin - c) / 1e6) * p.in + (c / 1e6) * p.cachedIn + (tout / 1e6) * p.out;
};
const brl = (u: number) => `R$ ${(u * BRL).toFixed(2)}`;

(async () => {
  const d30 = new Date(Date.now() - 30 * 864e5);
  const nome = arg("cliente", "jr");
  const c = await prisma.client.findFirst({ where: { name: { contains: nome, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error(`cliente "${nome}" não encontrado`); process.exit(1); }

  const conns = await prisma.waConnection.findMany({ where: { clientId: c.id }, select: { id: true } });
  const connIds = conns.map((x) => x.id);
  const falsos = await prisma.waContact.findMany({ where: { connectionId: { in: connIds }, waId: { startsWith: "5551900" } }, select: { id: true } });
  const fake = new Set(falsos.map((x) => x.id));

  console.log(`\n═══════════ ${c.name} — 30 dias · projeção p/ ${ALVO} leads/mês ═══════════`);
  console.log(`  (dólar R$ ${BRL} · tarifa Meta serviço R$ ${TARIFA_SERVICO} · ${connIds.length} número(s))`);

  // ── IA ──
  const todos = await prisma.aiInteraction.findMany({
    where: { clientId: c.id, createdAt: { gte: d30 } },
    select: { contactId: true, tokensIn: true, tokensOut: true, model: true, latencyMs: true, createdAt: true },
  });
  const t = todos.filter((x) => !x.contactId || !fake.has(x.contactId));
  const leads = new Set(t.map((x) => x.contactId ?? "?"));
  const L = leads.size || 1, T = t.length || 1;

  const agg = await prisma.aiUsage.aggregate({ where: { clientId: c.id, pipeline: "chat", createdAt: { gte: d30 } }, _sum: { tokensIn: true, cachedTokens: true } });
  const cache = (agg._sum.tokensIn ?? 0) ? (agg._sum.cachedTokens ?? 0) / (agg._sum.tokensIn ?? 1) : 0;

  const chatReal = t.reduce((a, x) => a + custoChat(x.model ?? "gpt-4.1-mini", x.tokensIn, x.tokensOut, cache), 0);
  const chatPior = t.reduce((a, x) => a + custoChat(x.model ?? "gpt-4.1-mini", x.tokensIn, x.tokensOut, 0), 0);

  // Outros pipelines: separa fixo (cron diário) de marginal (por turno), por regressão.
  const uso = await prisma.aiUsage.findMany({ where: { clientId: c.id, pipeline: { not: "chat" }, createdAt: { gte: d30 } }, select: { createdAt: true, costUsd: true } });
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const pd = new Map<string, { custo: number; turnos: number }>();
  const g = (k: string) => pd.get(k) ?? (pd.set(k, { custo: 0, turnos: 0 }), pd.get(k)!);
  for (const u of uso) g(dia(u.createdAt)).custo += u.costUsd;
  for (const x of t) g(dia(x.createdAt)).turnos++;
  const pts = [...pd.values()], n = pts.length;
  const sx = pts.reduce((a, p) => a + p.turnos, 0), sy = pts.reduce((a, p) => a + p.custo, 0);
  const sxx = pts.reduce((a, p) => a + p.turnos ** 2, 0), sxy = pts.reduce((a, p) => a + p.turnos * p.custo, 0);
  const den = n * sxx - sx * sx;
  const marg = Math.max(0, den ? (n * sxy - sx * sy) / den : 0);
  const fixo = Math.max(0, n ? (sy - marg * sx) / n : 0);

  const tpl = t.length / L;
  const turnosAlvo = ALVO * tpl;
  const iaOk = (chatReal / L) * ALVO + fixo * 30 + marg * turnosAlvo;
  const iaPior = (chatPior / L) * ALVO + fixo * 30 + marg * turnosAlvo;

  console.log(`\n── IA ──`);
  console.log(`  medido: ${leads.size} leads · ${t.length} turnos · ${tpl.toFixed(2)} turnos/lead · cache ${(100 * cache).toFixed(0)}%`);
  console.log(`  entrada ${Math.round(t.reduce((a, x) => a + x.tokensIn, 0) / T).toLocaleString("pt-BR")} tok/turno`);
  const lat = t.map((x) => x.latencyMs).filter((v) => v > 0).sort((a, b) => a - b);
  if (lat.length) console.log(`  resposta: média ${(lat.reduce((a, b) => a + b, 0) / lat.length / 1000).toFixed(1)}s · mediana ${(lat[Math.floor(lat.length / 2)] / 1000).toFixed(1)}s · p90 ${(lat[Math.floor(.9 * lat.length)] / 1000).toFixed(1)}s`);
  console.log(`  PROJEÇÃO: ${brl(iaOk)}/mês   (pior caso, cache 0%: ${brl(iaPior)})`);

  // ── META ──
  const msgs = await prisma.waMessage.findMany({
    where: { connectionId: { in: connIds }, timestamp: { gte: d30 } },
    select: { contactId: true, direction: true, timestamp: true, aiGenerated: true, type: true },
  });
  const m = msgs.filter((x) => !fake.has(x.contactId));

  // Leads vindos de anúncio: abrem janela gratuita de 7 dias (Free Entry Point).
  const deAnuncio = new Set((await prisma.waLead.findMany({
    where: { contactId: { in: [...new Set(m.map((x) => x.contactId))] } },
    select: { contactId: true, adId: true, adTitle: true },
  })).filter((l) => l.adId || l.adTitle).map((l) => l.contactId));

  const porContato = new Map<string, { t: number; dir: string }[]>();
  for (const x of m) { const a = porContato.get(x.contactId) ?? []; a.push({ t: x.timestamp.getTime(), dir: x.direction }); porContato.set(x.contactId, a); }

  let saidaGratis = 0, saidaCobravel = 0;
  for (const [id, arr] of porContato) {
    arr.sort((a, b) => a.t - b.t);
    const anuncio = deAnuncio.has(id);
    let fepAte = 0, janelaAte = 0;
    for (const e of arr) {
      if (e.dir === "in") {
        janelaAte = e.t + 24 * 3600e3;
        if (anuncio && e.t > fepAte) fepAte = e.t + FEP_DIAS * 24 * 3600e3;
      } else {
        if (anuncio && e.t <= fepAte) saidaGratis++;      // janela do anúncio: tudo grátis
        else if (e.t <= janelaAte) saidaCobravel++;        // serviço: cobrado desde 01/10/2026
        else saidaCobravel++;                              // fora da janela: template, mais caro
      }
    }
  }
  const totalLeadsMsg = porContato.size || 1;
  const pctAnuncio = 100 * deAnuncio.size / totalLeadsMsg;
  const cobravelPorLead = saidaCobravel / totalLeadsMsg;
  const projCobravel = Math.max(0, cobravelPorLead * ALVO - FRANQUIA * connIds.length);

  console.log(`\n── META / WhatsApp ──`);
  console.log(`  medido: ${m.filter((x) => x.direction === "in").length} recebidas · ${m.filter((x) => x.direction === "out").length} enviadas`);
  console.log(`  leads vindos de ANÚNCIO: ${deAnuncio.size} de ${totalLeadsMsg} (${pctAnuncio.toFixed(0)}%)`);
  console.log(`  saídas na janela gratuita de ${FEP_DIAS}d: ${saidaGratis} · cobráveis: ${saidaCobravel} (${cobravelPorLead.toFixed(1)}/lead)`);
  console.log(`  PROJEÇÃO: ${(cobravelPorLead * ALVO).toFixed(0)} cobráveis − ${FRANQUIA * connIds.length} de franquia = ${projCobravel.toFixed(0)}`);
  console.log(`            R$ ${(projCobravel * TARIFA_SERVICO).toFixed(2)}/mês`);

  // ── TOTAL ──
  const meta = projCobravel * TARIFA_SERVICO;
  console.log(`\n═══ TOTAL por mês (${ALVO} leads) ═══`);
  console.log(`  IA ................ ${brl(iaOk).padStart(12)}   (pior: ${brl(iaPior)})`);
  console.log(`  Meta .............. ${("R$ " + meta.toFixed(2)).padStart(12)}`);
  console.log(`  Railway ........... ${"R$ 80.00".padStart(12)}   (fixo, informado)`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL ............. ${("R$ " + (iaOk * BRL + meta + 80).toFixed(2)).padStart(12)}`);
  console.log(`  por lead .......... ${("R$ " + ((iaOk * BRL + meta + 80) / ALVO).toFixed(3)).padStart(12)}\n`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
