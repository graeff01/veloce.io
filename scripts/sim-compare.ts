/**
 * CHECK DE EQUIVALÊNCIA COMPORTAMENTAL — Fase 0 do programa de eficiência de Runtime.
 *
 * Compara um run CANDIDATO (com uma otimização) contra o BASELINE congelado, conversa a
 * conversa, turno a turno. Reprova se QUALQUER turno divergir na assinatura (decisão/tools/
 * artefatos) — o texto pode variar. Princípio: otimizar a arquitetura, nunca o atendimento.
 *
 * Uso:
 *   npx tsx scripts/sim-compare.ts --baseline sim-baseline --candidate sim-candidato
 * Saída: relatório por conversa + veredito EQUIVALENTE / DIVERGENTE (exit 0/1).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareConversation, atendimentoEvents, type SimTurn } from "@/lib/ai-agent/eval/sim-compare";

function arg(name: string): string | undefined { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; }

interface ConvFile { contactId: string; name: string | null; turns: SimTurn[] }
function load(dir: string): Map<string, ConvFile> {
  const m = new Map<string, ConvFile>();
  for (const f of readdirSync(dir)) {
    if (f === "summary.json" || !f.endsWith(".json")) continue;
    const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as ConvFile;
    m.set(d.contactId, d);
  }
  return m;
}

function main() {
  const baseDir = arg("baseline"); const candDir = arg("candidate");
  if (!baseDir || !candDir) { console.error("uso: --baseline <dir> --candidate <dir>"); process.exit(2); }
  const base = load(baseDir); const cand = load(candDir);

  let convos = 0, turnsTotal = 0, turnsEqual = 0, convDivergent = 0;
  const eventDrift: string[] = [];
  const lines: string[] = [];

  for (const [id, b] of base) {
    const c = cand.get(id);
    if (!c) { lines.push(`⚠ ${b.name ?? id}: ausente no candidato`); continue; }
    convos++;
    const cmp = compareConversation(b.turns, c.turns);
    turnsTotal += cmp.turnsTotal; turnsEqual += cmp.turnsEqual;
    // Eventos de atendimento (vídeo/catálogo/PDF/foto/escala) — o total tem que bater.
    const eb = atendimentoEvents(b.turns), ec = atendimentoEvents(c.turns);
    const evDiff = Object.keys(eb).filter((k) => eb[k] !== ec[k]).map((k) => `${k} ${eb[k]}→${ec[k]}`);
    if (cmp.divergences.length || evDiff.length) {
      convDivergent++;
      lines.push(`✗ ${(b.name ?? id).padEnd(24)} ${cmp.turnsEqual}/${cmp.turnsTotal} turnos iguais${evDiff.length ? ` · EVENTOS: ${evDiff.join(", ")}` : ""}`);
      for (const dv of cmp.divergences.slice(0, 6)) lines.push(`    turno ${dv.turn}: ${dv.diffs.join(" | ")}`);
      if (evDiff.length) eventDrift.push(`${b.name ?? id}: ${evDiff.join(", ")}`);
    } else {
      lines.push(`✓ ${(b.name ?? id).padEnd(24)} ${cmp.turnsTotal} turnos — equivalente`);
    }
  }

  console.log(lines.join("\n"));
  const pct = turnsTotal ? (100 * turnsEqual / turnsTotal).toFixed(2) : "—";
  console.log(`\n─── EQUIVALÊNCIA ─── ${convos} conversas · ${turnsEqual}/${turnsTotal} turnos idênticos (${pct}%) · ${convDivergent} conversas divergentes`);
  if (eventDrift.length) console.log(`⚠ DRIFT DE EVENTOS DE ATENDIMENTO (invariante quebrado):\n  ${eventDrift.join("\n  ")}`);

  if (convos === 0) {
    console.log("\n❌ NADA COMPARADO — nenhum contactId casou entre baseline e candidato (dirs errados ou run incompleto).");
    process.exit(2);
  }
  const equivalent = convDivergent === 0;
  console.log(equivalent ? "\n✅ EQUIVALENTE — comportamento preservado, otimização pode ser incorporada." : "\n❌ DIVERGENTE — atendimento mudou; a otimização deve ser descartada ou reformulada.");
  process.exit(equivalent ? 0 : 1);
}

main();
