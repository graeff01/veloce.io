/**
 * Responde: ligar AI_SECURITY_MODE=enforce quebra alguma coisa?
 * Mede cada teto e cada bloqueio contra o histórico REAL, em vez de supor.
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { scanEgress, scanThirdPartyPii } from "@/lib/ai-agent/security/egress";
import { detectInjection } from "@/lib/ai-agent/security/detect";
import { decidePolicy } from "@/lib/ai-agent/security/policy";

async function main() {
  const conns = await db.waConnection.findMany({ select: { id: true, clientId: true } });
  const ids = conns.map((c) => c.id);

  // ── 1. WEBHOOK: 600 por conexão/minuto. Já teve pico perto disso? ──────────
  const msgs = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: ids } } },
    select: { timestamp: true, contactId: true, direction: true, text: true,
              contact: { select: { connectionId: true, waId: true } } },
    orderBy: { timestamp: "asc" }, take: 60000,
  });
  const porMin = new Map<string, number>();
  for (const m of msgs) {
    const k = `${m.contact.connectionId}|${m.timestamp.toISOString().slice(0, 16)}`;
    porMin.set(k, (porMin.get(k) ?? 0) + 1);
  }
  const picoMin = Math.max(0, ...porMin.values());
  console.log(`[webhook] teto 600/min por conexão · PICO real: ${picoMin}/min → ${picoMin >= 600 ? "⚠️ ESTOURA" : "folga de " + (600 - picoMin)}`);
  console.log(`          (e ao estourar devolve 429; a Meta reentrega com backoff — nada se perde)`);

  // ── 2. INBOUND por contato: 40 / 10min ────────────────────────────────────
  const porContato10 = new Map<string, number>();
  for (const m of msgs) {
    if (m.direction !== "in") continue;
    const t = m.timestamp; const bucket = Math.floor(t.getTime() / 600000);
    const k = `${m.contactId}|${bucket}`;
    porContato10.set(k, (porContato10.get(k) ?? 0) + 1);
  }
  const picoCont = Math.max(0, ...porContato10.values());
  const estouram = [...porContato10.values()].filter((v) => v > 40).length;
  console.log(`\n[inbound/contato] teto 40/10min · PICO real: ${picoCont} · janelas que estouram: ${estouram}`);

  // ── 3. TURNOS de IA por contato/hora: 25 ──────────────────────────────────
  const inter = await db.aiInteraction.findMany({ select: { contactId: true, createdAt: true }, take: 60000 });
  const porContatoH = new Map<string, number>();
  for (const i of inter) {
    if (!i.contactId) continue;
    const k = `${i.contactId}|${Math.floor(i.createdAt.getTime() / 3600000)}`;
    porContatoH.set(k, (porContatoH.get(k) ?? 0) + 1);
  }
  const picoTurnos = Math.max(0, ...porContatoH.values());
  console.log(`[turnos IA/contato/h] teto 25 · PICO real: ${picoTurnos} · janelas que estouram: ${[...porContatoH.values()].filter(v => v > 25).length}`);

  // ── 4. EGRESSO: quantas respostas REAIS seriam bloqueadas/redigidas? ──────
  const saidas = await db.waMessage.findMany({
    where: { contact: { connectionId: { in: ids } }, direction: "out", aiGenerated: true, text: { not: null } },
    select: { text: true, contact: { select: { waId: true } } }, take: 60000,
  });
  let bloq = 0, redig = 0, pii = 0;
  const exemplos: string[] = [];
  for (const s of saidas) {
    const eg = scanEgress(s.text);
    const p = scanThirdPartyPii(s.text, { contactWaId: s.contact.waId, sources: "" });
    if (eg.mustBlock) { bloq++; if (exemplos.length < 6) exemplos.push(`BLOQUEIO ${eg.findings.map(f=>f.kind)} · ${String(s.text).slice(0,90)}`); }
    else if (eg.findings.length) redig++;
    if (p.length) { pii++; if (exemplos.length < 12) exemplos.push(`PII ${p.map(f=>f.kind)} · ${String(s.text).replace(/\n/g," ").slice(0,90)}`); }
  }
  console.log(`\n[egresso] ${saidas.length} respostas reais da IA`);
  console.log(`   bloqueadas (vira fallback): ${bloq}`);
  console.log(`   redigidas (tira o trecho) : ${redig}`);
  console.log(`   PII de terceiro (bloqueia): ${pii}   ⚠️ medido SEM as fontes do turno — em produção o telefone da loja estaria nelas`);
  for (const e of exemplos) console.log(`     ${e}`);

  // ── 5. POLÍTICA por turno: quantos leads cairiam em contenção/restrição? ──
  let contido = 0, restrito = 0, rigor = 0;
  for (const m of msgs) {
    if (m.direction !== "in" || !m.text) continue;
    const p = decidePolicy(detectInjection(m.text), "enforce");
    if (p.contain) contido++; else if (p.profile === "restricted") restrito++; else if (p.profile === "rigor") rigor++;
  }
  console.log(`\n[política] contidos (escala p/ humano): ${contido} · restritos: ${restrito} · rigor: ${rigor}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
