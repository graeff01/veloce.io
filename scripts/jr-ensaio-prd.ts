/**
 * Ensaio de produção: roda MUITAS conversas reais contra o motor atual, com
 * todos os guardas ligados, e mede como seria um dia de atendimento.
 *
 * Não é o mesmo que produção — o modelo varia, e aqui não há vendedora
 * assumindo a conversa. Mas responde a pergunta que importa antes de ligar:
 * ela se cala demais? dispara guarda à toa? erra o que a gente já corrigiu?
 *
 *   npx tsx scripts/jr-ensaio-prd.ts --n 12
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import { conhecimentoCompleto } from "@/lib/ai-agent/retrieval";
import { medidasEmCm, medidasInventadas } from "@/lib/ai-agent/grounding";
import { lerTabelaMedidas, medidasErradasDoProduto } from "@/lib/ai-agent/medidas-produto";
import { removerPromessaDeAlterar } from "@/lib/ai-agent/security/autoridade";
import type { ChatMessage } from "@/lib/openai";

const C = "cmrjao9n700dg5vudg1zlymk9";
const N = Number(process.argv[process.argv.indexOf("--n") + 1]) || 12;
// Rajada de chamadas estoura o rate-limit e o orchestrator cai no fallback —
// vira "erro técnico" que não é do fluxo. Já documentado; esqueci aqui e o
// primeiro ensaio deu 33% de erro por isso.
const PAUSA = Number(process.env.PAUSA_MS ?? 2500);

/**
 * Agrupa as mensagens do lead em TURNOS por intervalo de tempo.
 *
 * A versão anterior fechava turno só quando havia resposta da loja — e no
 * histórico da JR a maioria das conversas é quase só do lead (as vendedoras
 * respondiam pelo celular, fora do sistema). Resultado: 238 mensagens viravam
 * UM turno, e o ensaio rodava 1 conversa de 10 pedidas.
 *
 * Por tempo: mensagens em rajada são um turno; pausa longa começa outro. É
 * como a conversa acontece de verdade.
 */
const GAP_MS = 3 * 60_000;

function agrupar(msgs: { direction: string; text: string | null; type: string; timestamp: Date }[]): string[] {
  const out: string[] = []; let buf: string[] = []; let ultimo = 0;
  const fechar = () => { if (buf.length) { out.push(buf.join(" ").slice(0, 900)); buf = []; } };
  for (const m of msgs) {
    const t = m.text ?? (m.type === "location" ? "[O cliente compartilhou a localização.]" : null);
    if (m.direction !== "in" || !t) { fechar(); continue; }
    const ts = m.timestamp.getTime();
    if (ultimo && ts - ultimo > GAP_MS) fechar();
    buf.push(t); ultimo = ts;
  }
  fechar();
  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  const acervo = await conhecimentoCompleto(C);
  const cfg = await db.aiAgentConfig.findUnique({ where: { clientId: C }, select: { customPrompt: true } });
  const oficiais = medidasEmCm(`${acervo}\n${cfg?.customPrompt ?? ""}`);
  const tabela = lerTabelaMedidas(acervo);

  const conns = (await db.waConnection.findMany({ where: { clientId: C }, select: { id: true } })).map((c) => c.id);
  // Conversas REAIS com volume — as mais recentes com pelo menos 4 turnos do lead.
  // Ordenar por data pegava quase só lead de uma mensagem — o primeiro ensaio
  // rodou 1 conversa de 12 pedidas. Aqui entra quem CONVERSOU de verdade.
  const porVolume = await db.waMessage.groupBy({
    by: ["contactId"], where: { contact: { connectionId: { in: conns } }, direction: "in" },
    _count: { _all: true }, orderBy: { _count: { contactId: "desc" } }, take: 60,
  });
  const cands = await db.waContact.findMany({
    where: { id: { in: porVolume.map((v) => v.contactId) } },
    select: { id: true, name: true, displayName: true },
  });

  let turnos = 0, abstencoes = 0, bloqueios = 0, erros = 0;
  const problemas: string[] = [];
  const ferramentas = new Map<string, number>();
  const guardas = new Map<string, number>();
  let usadas = 0;

  for (const ct of cands) {
    if (usadas >= N) break;
    const raw = await db.waMessage.findMany({ where: { contactId: ct.id }, orderBy: { timestamp: "asc" }, select: { direction: true, text: true, type: true, timestamp: true } });
    const ts = agrupar(raw);
    if (ts.length < 4) continue;
    usadas++;
    const quem = ct.displayName ?? ct.name ?? ct.id.slice(-6);
    const transcript: ChatMessage[] = []; const ficha: Record<string, unknown> = {};

    for (const t of ts.slice(0, 12)) {
      turnos++;
      await new Promise((r) => setTimeout(r, PAUSA));
      transcript.push({ role: "user", content: t });
      let reply = "", dec = "", st = "";
      try {
        const out = await runAgent(
          { clientId: C, connectionId: "sim", contact: { id: `prd-${ct.id}`, name: quem, waId: "0" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? ""; dec = out.decision ?? ""; st = out.status ?? "";
        for (const tc of out.toolCalls ?? []) { const n = (tc as { name?: string }).name ?? ""; if (n) ferramentas.set(n, (ferramentas.get(n) ?? 0) + 1); }
      } catch (e) { erros++; reply = `[ERRO ${String((e as Error).message).slice(0, 50)}]`; }
      transcript.push({ role: "assistant", content: reply });

      if (dec === "abster") abstencoes++;
      if (st === "blocked" || dec === "bloqueado") bloqueios++;
      if (st === "error") erros++;

      for (const e of medidasErradasDoProduto(reply, tabela)) problemas.push(`[${quem}] MEDIDA DO PRODUTO — ${e}`);
      for (const e of medidasInventadas(reply, oficiais)) problemas.push(`[${quem}] MEDIDA SEM FONTE — ${e}`);
      const pr = removerPromessaDeAlterar(reply);
      if (pr.removidas.length) problemas.push(`[${quem}] PROMESSA — ${pr.removidas[0]}`);
    }
    process.stdout.write(".");
  }

  console.log(`\n\n═══ ENSAIO DE PRODUÇÃO ═══`);
  console.log(`  ${usadas} conversas reais · ${turnos} turnos\n`);
  const pct = (n: number) => `${((n / Math.max(1, turnos)) * 100).toFixed(1)}%`;
  console.log(`  abstenções (calou-se) .... ${String(abstencoes).padStart(3)}  ${pct(abstencoes)}`);
  console.log(`  bloqueios (foi p/ humano)  ${String(bloqueios).padStart(3)}  ${pct(bloqueios)}`);
  console.log(`  erros técnicos ........... ${String(erros).padStart(3)}  ${pct(erros)}`);
  console.log(`\n  ferramentas usadas:`);
  for (const [n, c] of [...ferramentas].sort((a, b) => b[1] - a[1])) console.log(`     ${n.padEnd(24)} ${c}`);
  console.log(`\n  problemas detectados: ${problemas.length}`);
  for (const p of problemas.slice(0, 15)) console.log(`     ✗ ${p}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
