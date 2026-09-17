/**
 * Mede as regras novas contra TRÁFEGO REAL de produção, antes de qualquer merge.
 *  - entrada: as regras de autoridade/cadastro sobre as mensagens dos leads
 *  - saída:   a remoção de promessa sobre TODAS as respostas que a IA já mandou
 *
 * O que importa aqui é o alarme falso. Uma promessa que escapa é um caso a mais
 * para a regra; um atendimento bom calado é dano imediato.
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { detectInjection } from "@/lib/ai-agent/security/detect";
import { removerPromessaDeAlterar } from "@/lib/ai-agent/security/autoridade";

async function main() {
  const conns = await db.waConnection.findMany({ select: { id: true, clientId: true } });
  const ids = conns.map((c) => c.id);

  // ── ENTRADA ────────────────────────────────────────────────────────────────
  const entradas = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: ids } }, direction: "in", text: { not: null } },
    select: { text: true }, take: 60000,
  });
  const faixas = { contido: 0, restrito: 0, rigor: 0, sinal: 0 };
  const novos: string[] = [];
  for (const m of entradas) {
    const d = detectInjection(m.text);
    const tocaNovo = d.labels.includes("cadastro_command") || d.labels.includes("false_authority");
    if (d.score >= 0.85) faixas.contido++;
    else if (d.score >= 0.6) faixas.restrito++;
    else if (d.score >= 0.3) faixas.rigor++;
    else if (d.score > 0) faixas.sinal++;
    if (tocaNovo && novos.length < 25) novos.push(`[${d.score} ${d.labels.join(",")}] ${String(m.text).replace(/\n/g, " ").slice(0, 120)}`);
  }
  console.log(`=== ENTRADA · ${entradas.length} mensagens reais de lead ===`);
  console.log(`  conter (≥0,85): ${faixas.contido} · restringir (≥0,6): ${faixas.restrito} · rigor (≥0,3): ${faixas.rigor} · só sinal: ${faixas.sinal}`);
  console.log(`  limpas: ${entradas.length - faixas.contido - faixas.restrito - faixas.rigor - faixas.sinal}`);
  console.log(`\n  o que as regras NOVAS acendem (amostra):`);
  for (const l of novos) console.log(`   ${l}`);

  // ── SAÍDA ──────────────────────────────────────────────────────────────────
  const saidas = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: ids } }, direction: "out", aiGenerated: true, text: { not: null } },
    select: { text: true, timestamp: true, contact: { select: { displayName: true, name: true } } },
    take: 60000,
  });
  const pegos: { quando: string; quem: string; frase: string; resto: number }[] = [];
  for (const m of saidas) {
    const r = removerPromessaDeAlterar(m.text);
    if (r.removidas.length) pegos.push({
      quando: m.timestamp.toISOString().slice(0, 16),
      quem: m.contact.displayName ?? m.contact.name ?? "?",
      frase: r.removidas.join(" | "),
      resto: r.texto.length,
    });
  }
  console.log(`\n=== SAÍDA · ${saidas.length} respostas que a IA REALMENTE mandou ===`);
  console.log(`  promessas de alterar cadastro encontradas: ${pegos.length} (${((pegos.length / Math.max(1, saidas.length)) * 100).toFixed(3)}%)`);
  for (const p of pegos.slice(0, 40)) {
    console.log(`   ${p.quando} · ${p.quem} · "${p.frase}"${p.resto === 0 ? "  ⚠️ era a mensagem inteira → fallback" : ""}`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
