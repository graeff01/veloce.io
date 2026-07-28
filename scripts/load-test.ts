/**
 * Teste de carga do webhook de atendimento (ingestão sob concorrência).
 *
 * PARA QUE SERVE
 *   Responde "o sistema aguenta 10/15 atendimentos simultâneos e 60/90 leads/dia?"
 *   com NÚMEROS, não com achismo. Dispara N leads virtuais mandando rajadas de
 *   mensagens ao mesmo tempo contra o webhook real e mede:
 *     - latência do webhook (p50/p90/p95/p99/max)
 *     - taxa de erro e distribuição de status HTTP
 *     - throughput (req/s)
 *     - SATURAÇÃO DO POOL do Postgres ao longo da rajada (via /api/health)
 *
 * SEGURANÇA — LEIA ANTES DE RODAR
 *   Cada webhook aceito CRIA lead/mensagem no banco e ENFILEIRA o agente. Se o agente
 *   estiver LIGADO na conexão de teste, ele vai chamar o LLM (custo) e responder no
 *   WhatsApp. Portanto:
 *     • Rode contra STAGING, com uma WaConnection DEDICADA de teste.
 *     • Deixe o AiAgentConfig dessa conexão PAUSADO/desligado, OU em testMode sem os
 *       waIds virtuais liberados → o runner retorna "skipped" antes de LLM/envio.
 *       (Assim você mede o caminho de INGESTÃO — que é onde 15 webhooks simultâneos
 *        pressionam o pool — sem gastar LLM nem mandar mensagem pra ninguém.)
 *     • Para medir também o caminho do agente, ligue-o em staging com um sender de
 *       sandbox; NUNCA em produção às cegas.
 *   Por padrão o script SÓ roda contra localhost. Para outro host, exporte LOADTEST_ACK=1
 *   confirmando que é staging e que a conexão de teste está segura.
 *
 * USO
 *   LOADTEST_BASE_URL=https://staging... \
 *   WHATSAPP_APP_SECRET=<app secret da conexão de teste> \
 *   LOADTEST_PHONE_NUMBER_ID=<phone_number_id de uma WaConnection existente> \
 *   LOADTEST_ACK=1 \
 *   npx tsx scripts/load-test.ts
 *
 * KNOBS (env)
 *   LOADTEST_LEADS=30        leads virtuais distintos
 *   LOADTEST_CONCURRENCY=15  máximo de requests em voo ao mesmo tempo
 *   LOADTEST_BURST=3         mensagens por lead (WhatsApp: gente escreve em partes)
 *   LOADTEST_RAMP_MS=5000    espalha a chegada dos leads nesta janela
 *   LOADTEST_GAP_MS=800      intervalo entre mensagens do mesmo lead
 *   LOADTEST_NO_SIGN=1       não assina (só p/ dev local sem WHATSAPP_APP_SECRET)
 */

import { createHmac, randomUUID } from "node:crypto";

const BASE_URL = (process.env.LOADTEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const WEBHOOK_PATH = "/api/whatsapp/webhook";
const HEALTH_PATH = "/api/health";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const PHONE_NUMBER_ID = process.env.LOADTEST_PHONE_NUMBER_ID || "";
const NO_SIGN = process.env.LOADTEST_NO_SIGN === "1";

const LEADS = Number(process.env.LOADTEST_LEADS || 30);
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY || 15);
const BURST = Number(process.env.LOADTEST_BURST || 3);
const RAMP_MS = Number(process.env.LOADTEST_RAMP_MS || 5000);
const GAP_MS = Number(process.env.LOADTEST_GAP_MS || 800);
const REQ_TIMEOUT_MS = 30_000;

// ── Guardas de segurança ─────────────────────────────────────────────────────
function isLocal(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch { return false; }
}
function preflightChecks(): void {
  if (!isLocal(BASE_URL) && process.env.LOADTEST_ACK !== "1") {
    fail(
      `Recusando rodar contra host não-local (${BASE_URL}) sem LOADTEST_ACK=1.\n` +
      `  Confirme que é STAGING e que a conexão de teste está com o agente pausado/em testMode,\n` +
      `  depois exporte LOADTEST_ACK=1. NUNCA rode contra produção às cegas.`,
    );
  }
  if (!PHONE_NUMBER_ID) {
    fail("Defina LOADTEST_PHONE_NUMBER_ID = phone_number_id de uma WaConnection existente no ambiente-alvo.");
  }
  if (!APP_SECRET && !NO_SIGN) {
    fail(
      "Sem WHATSAPP_APP_SECRET: o webhook vai rejeitar (401/503) em staging.\n" +
      "  Use o App Secret da conexão de teste, ou LOADTEST_NO_SIGN=1 só em dev local sem secret.",
    );
  }
}
function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// ── Construção de payload (formato Meta WhatsApp Cloud API) ───────────────────
function waId(leadIdx: number): string {
  // Número BR fake e estável por lead virtual (não colide com número real de cliente).
  return `55519${String(900000000 + leadIdx).slice(-9)}`;
}
function buildBody(leadIdx: number, seq: number): string {
  const from = waId(leadIdx);
  const now = Math.floor(Date.now() / 1000);
  const body = {
    object: "whatsapp_business_account",
    entry: [{
      id: `loadtest-entry-${leadIdx}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5551000000000", phone_number_id: PHONE_NUMBER_ID },
          contacts: [{ profile: { name: `LoadTest Lead ${leadIdx}` }, wa_id: from }],
          messages: [{
            from,
            // id único por mensagem → evita o dedupe por waMessageId do webhook.
            id: `wamid.LOADTEST.${leadIdx}.${seq}.${randomUUID()}`,
            timestamp: String(now),
            type: "text",
            text: { body: `teste de carga — lead ${leadIdx} msg ${seq}` },
          }],
        },
      }],
    }],
  };
  return JSON.stringify(body);
}
function sign(raw: string): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!NO_SIGN && APP_SECRET) {
    headers["x-hub-signature-256"] = "sha256=" + createHmac("sha256", APP_SECRET).update(raw, "utf8").digest("hex");
  }
  return headers;
}

// ── Semáforo de concorrência (limita requests em voo) ─────────────────────────
class Semaphore {
  private active = 0;
  private q: (() => void)[] = [];
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return; }
    await new Promise<void>((r) => this.q.push(r));
    this.active++;
  }
  release(): void { this.active--; this.q.shift()?.(); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Amostragem do pool via /api/health (roda em paralelo com a carga) ─────────
type PoolSample = { total: number; idle: number; waiting: number; max: number; dbLatencyMs: number };
const poolSamples: PoolSample[] = [];
let sampling = true;
async function sampleHealthLoop(): Promise<void> {
  while (sampling) {
    try {
      const t0 = Date.now();
      const res = await fetch(BASE_URL + HEALTH_PATH, { signal: AbortSignal.timeout(5000) });
      const j = (await res.json()) as { pool?: Omit<PoolSample, "dbLatencyMs">; latencyMs?: number };
      if (j.pool) poolSamples.push({ ...j.pool, dbLatencyMs: j.latencyMs ?? Date.now() - t0 });
    } catch { /* amostra perdida não invalida o teste */ }
    await sleep(1000);
  }
}

// ── Uma requisição medida ─────────────────────────────────────────────────────
type Result = { ms: number; status: number | "error"; };
const results: Result[] = [];
async function fireOne(leadIdx: number, seq: number): Promise<void> {
  const raw = buildBody(leadIdx, seq);
  const t0 = performance.now();
  try {
    const res = await fetch(BASE_URL + WEBHOOK_PATH, {
      method: "POST", body: raw, headers: sign(raw), signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    results.push({ ms: performance.now() - t0, status: res.status });
  } catch {
    results.push({ ms: performance.now() - t0, status: "error" });
  }
}

// ── Estatística ───────────────────────────────────────────────────────────────
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}
function fmt(n: number): string { return n.toFixed(0).padStart(6); }

async function main(): Promise<void> {
  preflightChecks();

  console.log(`\n▶ Teste de carga → ${BASE_URL}${WEBHOOK_PATH}`);
  console.log(`  leads=${LEADS} concorrência=${CONCURRENCY} burst=${BURST} ramp=${RAMP_MS}ms gap=${GAP_MS}ms`);
  console.log(`  total de requests = ${LEADS * BURST}  |  assinatura=${NO_SIGN ? "OFF" : "ON"}\n`);

  // Preflight: /api/health tem que estar OK antes de começar.
  try {
    const res = await fetch(BASE_URL + HEALTH_PATH, { signal: AbortSignal.timeout(5000) });
    const j = await res.json();
    console.log(`  preflight /api/health → ${res.status} ${JSON.stringify(j)}`);
    if (!res.ok) fail("health não está OK — corrija o ambiente antes do teste.");
  } catch {
    fail(`não consegui alcançar ${BASE_URL}${HEALTH_PATH} — a app está de pé?`);
  }

  const sem = new Semaphore(CONCURRENCY);
  const healthTask = sampleHealthLoop();
  const start = performance.now();

  // Agenda: lead `l` chega em (l/LEADS)*RAMP_MS; msg `s` do lead sai em chegada + s*GAP_MS.
  // Cada envio respeita o semáforo global (máx CONCURRENCY em voo) — como o pico real.
  const tasks: Promise<void>[] = [];
  for (let l = 0; l < LEADS; l++) {
    const arrival = LEADS > 1 ? (l / LEADS) * RAMP_MS : 0;
    for (let s = 0; s < BURST; s++) {
      const at = arrival + s * GAP_MS;
      tasks.push((async () => {
        await sleep(at);
        await sem.acquire();
        try { await fireOne(l, s); } finally { sem.release(); }
      })());
    }
  }
  await Promise.all(tasks);

  const elapsedMs = performance.now() - start;
  sampling = false;
  await healthTask;

  // ── Relatório ───────────────────────────────────────────────────────────────
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const ok = results.filter((r) => typeof r.status === "number" && r.status >= 200 && r.status < 300).length;
  const errors = results.filter((r) => r.status === "error").length;
  const byStatus = new Map<string, number>();
  for (const r of results) byStatus.set(String(r.status), (byStatus.get(String(r.status)) ?? 0) + 1);
  const avg = lat.reduce((a, b) => a + b, 0) / (lat.length || 1);

  const peakWaiting = poolSamples.reduce((m, s) => Math.max(m, s.waiting), 0);
  const peakTotal = poolSamples.reduce((m, s) => Math.max(m, s.total), 0);
  const poolMax = poolSamples.at(-1)?.max ?? poolSamples[0]?.max ?? 0;
  const peakDbLatency = poolSamples.reduce((m, s) => Math.max(m, s.dbLatencyMs), 0);

  const line = "─".repeat(52);
  console.log(`\n${line}\nRESULTADO\n${line}`);
  console.log(`  duração total        ${(elapsedMs / 1000).toFixed(1)} s`);
  console.log(`  requests             ${results.length}  (throughput ${(results.length / (elapsedMs / 1000)).toFixed(1)} req/s)`);
  console.log(`  2xx                  ${ok}`);
  console.log(`  erros de rede        ${errors}`);
  console.log(`  status               ${[...byStatus.entries()].map(([k, v]) => `${k}:${v}`).join("  ")}`);
  console.log(`\n  latência do webhook (ms)`);
  console.log(`    p50 ${fmt(pct(lat, 50))}   p90 ${fmt(pct(lat, 90))}   p95 ${fmt(pct(lat, 95))}   p99 ${fmt(pct(lat, 99))}   max ${fmt(lat.at(-1) ?? 0)}   avg ${fmt(avg)}`);
  console.log(`\n  pool do Postgres (amostrado no /api/health, ${poolSamples.length} amostras)`);
  console.log(`    max configurado ${poolMax}   pico em uso ${peakTotal}   PICO NA FILA ${peakWaiting}   pico latência db ${fmt(peakDbLatency).trim()}ms`);

  // ── Veredicto ─────────────────────────────────────────────────────────────
  console.log(`\n${line}\nVEREDICTO\n${line}`);
  const verdicts: string[] = [];
  const p95 = pct(lat, 95);
  verdicts.push(errors === 0 ? "✓ sem erros de rede" : `✗ ${errors} erro(s) de rede — instabilidade sob carga`);
  const non2xx = results.length - ok - errors;
  verdicts.push(non2xx === 0 ? "✓ todos os webhooks aceitos (2xx)" : `✗ ${non2xx} resposta(s) não-2xx — cheque assinatura/conexão de teste`);
  verdicts.push(p95 < 2000 ? `✓ p95 ${p95.toFixed(0)}ms < 2s (webhook responde rápido)` : `⚠ p95 ${p95.toFixed(0)}ms ≥ 2s — a Meta reenvia se demorar; investigue`);
  if (poolSamples.length) {
    verdicts.push(peakWaiting === 0 ? `✓ fila do pool ficou em 0 (pool de ${poolMax} deu conta)` : `⚠ fila do pool chegou a ${peakWaiting} — AUMENTE DB_POOL_MAX (hoje ${poolMax}) e/ou reduza queries por turno`);
  } else {
    verdicts.push("⚠ nenhuma amostra de pool — /api/health não retornou `pool` (aplicou a mudança do health?)");
  }
  for (const v of verdicts) console.log(`  ${v}`);
  console.log("");

  const hardFail = errors > 0 || non2xx > 0;
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => fail(String(e)));
