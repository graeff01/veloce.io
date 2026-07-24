/**
 * Golden gate — prova de comportamento IDÊNTICO (Fase 0 do RFC de escala).
 * Congela a impressão digital comportamental do código atual e, depois de qualquer
 * refatoração do Runtime, acusa DRIFT estrutural (decisão/tools/foto/PDF/vídeo mudaram).
 * É o critério que autoriza ou barra cada fase. Roda em modo "test" (não grava/envia).
 *
 * Uso:
 *   # 1) congela o comportamento atual como baseline (ANTES de qualquer mudança de fase):
 *   AI_CHAT_TEMPERATURE=0 npx tsx scripts/golden-gate.ts capture --client <id> [--runs 3]
 *
 *   # 2) depois da mudança, verifica se algo regrediu (exit != 0 se houve drift estrutural):
 *   AI_CHAT_TEMPERATURE=0 npx tsx scripts/golden-gate.ts check --client <id> [--runs 3] [--json]
 *
 * Recomenda-se AI_CHAT_TEMPERATURE=0 nos dois passos: isola o efeito da MUDANÇA DE CÓDIGO
 * do ruído de amostragem do modelo (a temperatura de produção não é afetada por isto).
 * Requer DATABASE_URL e OPENAI_API_KEY. Casos: evals/cases/*.json (ou --cases-dir).
 * Baseline salvo em evals/snapshots/<clientId>.json.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { captureBaseline, checkAgainstBaseline, type GoldenBaseline } from "@/lib/ai-agent/eval/golden-diff";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SNAP_DIR = join(process.cwd(), "evals", "snapshots");
const snapPath = (clientId: string) => join(SNAP_DIR, `${clientId}.json`);

async function main() {
  const cmd = process.argv[2];
  const clientId = arg("client") ?? process.env.AI_EVAL_CLIENT_ID;
  const runs = Number(arg("runs") ?? 3);
  const casesDir = arg("cases-dir");

  if (cmd !== "capture" && cmd !== "check") {
    console.error("Uso: golden-gate.ts <capture|check> --client <id> [--runs 3] [--json] [--cases-dir <dir>]");
    process.exit(2);
  }
  if (!clientId) { console.error("Falta o cliente. Use --client <id> ou AI_EVAL_CLIENT_ID."); process.exit(2); }
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária (o gate roda o agente de verdade)."); process.exit(2); }

  if (cmd === "capture") {
    const baseline = await captureBaseline({ clientId, runs, casesDir });
    mkdirSync(SNAP_DIR, { recursive: true });
    writeFileSync(snapPath(clientId), JSON.stringify(baseline, null, 2));
    const multi = baseline.casos.filter((c) => c.signatures.length > 1).length;
    console.log(`\nBaseline capturado — cliente ${clientId}`);
    console.log(`  casos: ${baseline.casos.length} · runs/caso: ${runs} · temp: ${baseline.temperature}`);
    console.log(`  casos com >1 assinatura (não-determinísticos por natureza): ${multi}`);
    console.log(`  salvo em: evals/snapshots/${clientId}.json`);
    console.log(`\n  → congele isto em git ANTES de iniciar a próxima fase.\n`);
    process.exit(0);
  }

  // check
  if (!existsSync(snapPath(clientId))) {
    console.error(`Sem baseline para ${clientId}. Rode 'capture' primeiro.`);
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(snapPath(clientId), "utf8")) as GoldenBaseline;
  const effDir = casesDir ?? "evals/cases";
  if (baseline.casesDir && baseline.casesDir !== effDir) {
    console.error(`ATENÇÃO: baseline foi capturado com --cases-dir "${baseline.casesDir}", mas você está comparando contra "${effDir}". Use o mesmo conjunto.`);
    process.exit(2);
  }
  const report = await checkAgainstBaseline({ clientId, runs, baseline, casesDir });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nGolden gate — cliente ${clientId}  (baseline de ${baseline.createdAt})`);
    console.log(`  runs/caso: ${runs} · limiar de texto: ${report.textThreshold}\n`);
    for (const c of report.casos) {
      const mark = c.drift === "NONE" ? "OK   ✔" : c.drift === "TEXT" ? "TEXT ~" : "DRIFT ✘";
      console.log(`${mark}  ${c.id} — ${c.descricao}`);
      if (c.drift !== "NONE") console.log(`        ${c.detalhe}`);
      if (c.drift === "STRUCTURAL") {
        console.log(`        baseline: ${c.baseline.join("  |  ")}`);
        console.log(`        agora:    ${c.observed.join("  |  ")}`);
      }
    }
    console.log(`\n  ${report.ok}/${report.total} preservados · ${report.textDrift} drift de texto (revisar) · ${report.structuralDrift} DRIFT ESTRUTURAL`);
    console.log(report.structuralDrift ? `\n  ✘ REPROVADO: houve mudança de comportamento. NÃO fazer merge.\n` : `\n  ✔ APROVADO: comportamento estrutural preservado.\n`);
  }

  // Exit != 0 só em drift ESTRUTURAL (bloqueia CI). Drift de texto é aviso, não bloqueio.
  process.exit(report.structuralDrift > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
