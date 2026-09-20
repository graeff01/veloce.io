/**
 * Reproduz as conversas em que a IA ERROU e julga automaticamente se os mesmos
 * erros voltam. Sem leitura a olho: cada erro conhecido vira uma checagem.
 *
 * Origem das conversas: scripts/jr-achar-falhas.ts
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import { conhecimentoCompleto } from "@/lib/ai-agent/retrieval";
import { medidasEmCm, medidasInventadas } from "@/lib/ai-agent/grounding";
import { removerPromessaDeAlterar } from "@/lib/ai-agent/security/autoridade";
import { lerTabelaMedidas, medidasErradasDoProduto } from "@/lib/ai-agent/medidas-produto";
import type { ChatMessage } from "@/lib/openai";

const C = "cmrjao9n700dg5vudg1zlymk9";
const ALVOS = [
  { id: "cmrwjwlh301q45vqhv8j3zet0", nome: "Henrique", erro: "prometeu alterar + inventou largura (90cm)" },
  { id: "cmrwtefuk00g75vpg0pwiqwmh", nome: "Luis Gustavo", erro: "1º contato sem vídeo" },
  { id: "cmrwdx9wb01ly5vmrclomg1fn", nome: "Wilson", erro: "1º contato sem vídeo" },
];

function agrupar(msgs: { direction: string; text: string | null }[]): string[] {
  const out: string[] = []; let buf: string[] = [];
  for (const m of msgs) {
    if (m.direction === "in" && m.text) buf.push(m.text);
    else if (buf.length) { out.push(buf.join(" ")); buf = []; }
  }
  if (buf.length) out.push(buf.join(" "));
  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária."); process.exit(2); }
  const acervo = await conhecimentoCompleto(C);
  const cfg = await db.aiAgentConfig.findUnique({ where: { clientId: C }, select: { customPrompt: true } });
  const oficiais = medidasEmCm(`${acervo}\n${cfg?.customPrompt ?? ""}`);
  const tabela = lerTabelaMedidas(acervo);

  let falhas = 0;
  for (const alvo of ALVOS) {
    const raw = await db.waMessage.findMany({ where: { contactId: alvo.id }, orderBy: { timestamp: "asc" }, select: { direction: true, text: true, type: true } });
    const turnos = agrupar(raw.map((m) => ({ direction: m.direction, text: m.text })));
    console.log(`\n${"═".repeat(76)}\n### ${alvo.nome} — erro original: ${alvo.erro}\n    ${turnos.length} turnos do lead`);

    const transcript: ChatMessage[] = [];
    const ficha: Record<string, unknown> = {};
    const problemas: string[] = [];
    let mandouVideo = false, perguntouLoja = false, confirmouPrimeiro = false;

    for (const t of turnos) {
      transcript.push({ role: "user", content: t });
      let reply = "";
      try {
        const out = await runAgent(
          { clientId: C, connectionId: "sim", contact: { id: `reg-${alvo.id}`, name: alvo.nome, waId: "0" }, inboundText: t },
          { mode: "test", transcript, testFicha: ficha, testMemory: "" },
        );
        reply = out.reply ?? "";
        for (const tc of out.toolCalls ?? []) if ((tc as { name?: string }).name === "enviar_video") mandouVideo = true;
      } catch (e) { reply = `[ERRO ${String((e as Error).message).slice(0, 70)}]`; }
      transcript.push({ role: "assistant", content: reply });

      if (/primeiro contato/i.test(reply)) perguntouLoja = true;
      if (perguntouLoja && /^(sim|primeir|nunca|isso|por favor|pode)/i.test(t.trim())) confirmouPrimeiro = true;

      const inv = medidasInventadas(reply, oficiais);
      if (inv.length) problemas.push(`MEDIDA INVENTADA (${inv.join(",")}) — "${reply.replace(/\n/g, " ").slice(0, 88)}"`);
      const pr = removerPromessaDeAlterar(reply);
      if (pr.removidas.length) problemas.push(`PROMESSA DE ALTERAR — "${pr.removidas[0]}"`);
      // Guarda novo: medida certa atribuída ao produto ERRADO.
      for (const e of medidasErradasDoProduto(reply, tabela)) problemas.push(`MEDIDA DO PRODUTO — ${e}`);
    }

    if (confirmouPrimeiro && !mandouVideo) problemas.push("1º CONTATO CONFIRMADO E O VÍDEO NÃO SAIU");

    if (problemas.length) { falhas += problemas.length; for (const p of problemas) console.log(`    ✗ ${p}`); }
    else console.log(`    ✓ nenhum dos erros conhecidos voltou`);
  }

  console.log(`\n${"═".repeat(76)}\n${falhas === 0 ? "✓ NENHUM erro conhecido reapareceu" : `✗ ${falhas} problema(s)`}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
