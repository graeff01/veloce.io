/**
 * Ambiente de SIMULAÇÃO POR REPLAY — testa a IA contra conversas REAIS, offline.
 *
 * Para cada conversa real do cliente, usa APENAS as mensagens do CLIENTE (ignora o
 * vendedor humano), agrupa em turnos (como o debounce), e alimenta uma a uma no
 * runAgent(mode:"test") — a IA responde do zero a cada turno com TODA a arquitetura
 * (prompt, RAG, tools, playbook, guardrail). O transcript é montado com as respostas
 * da PRÓPRIA IA. Nada é enviado nem gravado (mode test). Reprodutível com temperatura 0.
 *
 * Uso (rode SEMPRE com AI_CHAT_TEMPERATURE=0 para reprodutibilidade):
 *   AI_CHAT_TEMPERATURE=0 npx tsx scripts/jr-simulation.ts --client <id> [--limit 50] [--min-msgs 2] [--out sim-out]
 *   (default --client = JR Churrasqueiras)
 * Requer DATABASE_URL e OPENAI_API_KEY. Custa chamadas de modelo (gpt-4o-mini) — offline.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prismaUnscoped } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";
import { groupLeadTurns } from "@/lib/ai-agent/eval/replay";
import { scoreConversation, type EvalTurn, type ConversationView } from "@/lib/ai-agent/eval/conversation-eval";
import { parseSpec } from "@/lib/ai-agent/intake";
import { summarizeConversation, REFRESH_EVERY } from "@/lib/ai-agent/memory";

function arg(name: string): string | undefined { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; }

async function main() {
  const clientId = arg("client") ?? "cmrjao9n700dg5vudg1zlymk9"; // JR
  const limit = Number(arg("limit") ?? 50);
  const minMsgs = Number(arg("min-msgs") ?? 2);
  const outDir = join(process.cwd(), arg("out") ?? "sim-out");
  // A/B do Prompt Compiler: com --prompt-file, a IA usa esse customPrompt (candidato limpo) no
  // lugar do banco; sem ele, usa o do banco (baseline atual). Só afeta o modo teste (offline).
  const promptFile = arg("prompt-file");
  const promptOverride = promptFile ? readFileSync(promptFile, "utf8") : undefined;
  if (promptOverride) console.log(`Prompt CANDIDATO: ${promptFile} (${promptOverride.length} chars) — override no modo teste.\n`);
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY necessária (a IA responde de verdade)."); process.exit(2); }
  if (process.env.AI_CHAT_TEMPERATURE !== "0") console.warn("AVISO: rode com AI_CHAT_TEMPERATURE=0 para reprodutibilidade.\n");

  // Config do cliente (p/ a ConversationView do avaliador).
  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({ where: { clientId }, select: { quotesEnabled: true, presentationVideoUrl: true, intakeSpec: true, vertical: true } });
  const requiredFields = parseSpec(cfg?.intakeSpec).filter((f) => f.required).map((f) => ({ key: f.key, label: f.label }));

  // Conversas reais do cliente.
  const conns = (await prismaUnscoped.waConnection.findMany({ where: { clientId }, select: { id: true } })).map((c) => c.id);
  // orderBy fixo: baseline e candidato têm que rodar EXATAMENTE as mesmas conversas na mesma ordem.
  const contacts = await prismaUnscoped.waContact.findMany({ where: { connectionId: { in: conns } }, orderBy: { id: "asc" }, select: { id: true, name: true, waId: true } });

  mkdirSync(outDir, { recursive: true });
  const summary: { contactId: string; name: string | null; turns: number; overall: number; errors: number; blocks: number; tools: string[] }[] = [];
  let processed = 0;

  for (const ct of contacts) {
    if (processed >= limit) break;
    const rawMsgs = await prismaUnscoped.waMessage.findMany({ where: { contactId: ct.id }, orderBy: { timestamp: "asc" }, select: { direction: true, text: true, type: true } });
    // Fidelidade: uma localização (pin GPS) chega ao agente como TEXTO em produção (o webhook
    // geocodifica e injeta um placeholder). Sem isso, a IA fica presa pedindo localização.
    const msgs = rawMsgs.map((m) => ({
      direction: m.direction,
      text: m.text ?? (m.type === "location" ? "[O cliente compartilhou a localização — se precisar, peça o bairro/cidade por texto.]" : null),
    }));
    const turnsText = groupLeadTurns(msgs);
    if (turnsText.length < minMsgs) continue;
    processed++;

    const transcript: ChatMessage[] = [];
    const testFicha: Record<string, unknown> = {}; // persiste a ficha entre turnos
    let testMemory = "";        // resumo rolante efêmero (reproduz agentMemory de produção)
    let memoryUpto = 0;         // nº de turnos já sumarizados
    const evalTurns: EvalTurn[] = [];
    const log: unknown[] = [];
    let errors = 0, blocks = 0;
    const toolsAll = new Set<string>();

    for (const turnText of turnsText) {
      let reply = "", decision = "erro", status = "error";
      const tools: string[] = [], artifacts: string[] = [];
      try {
        const out = await runAgent(
          { clientId, connectionId: "sim", contact: { id: `sim-${ct.id}`, name: ct.name, waId: "0000000000" }, inboundText: turnText },
          { mode: "test", transcript, testFicha, testMemory, promptOverride },
        );
        reply = out.reply ?? ""; decision = out.decision; status = out.status;
        for (const t of out.toolCalls ?? []) { tools.push(t.name); toolsAll.add(t.name); }
        for (const a of out.artifacts ?? []) artifacts.push(a.kind);
      } catch (e) { reply = `[ERRO: ${String((e as Error)?.message ?? e).slice(0, 120)}]`; }
      if (status === "error") errors++;
      if (status === "blocked" || decision === "bloqueado") blocks++;
      transcript.push({ role: "user", content: turnText }, { role: "assistant", content: reply });
      evalTurns.push({ inbound: turnText, outbound: reply, decision, status, guardrails: [], tools: tools.map((name) => ({ name })), intent: null });
      log.push({ lead: turnText, ia: reply, decision, status, tools, artifacts });

      // Memória rolante: PÓS-turno e a cada REFRESH_EVERY turnos (idêntico a produção). Sem isso,
      // conversas longas perdem contexto e a IA "reinicia" a abertura.
      const doneTurns = transcript.filter((m) => m.role === "assistant").length;
      if (doneTurns - memoryUpto >= REFRESH_EVERY) {
        const convoText = transcript.slice(-24).map((m) => `${m.role === "user" ? "Lead" : "Loja"}: ${typeof m.content === "string" ? m.content : ""}`).join("\n");
        testMemory = await summarizeConversation(testMemory, convoText, undefined, clientId);
        memoryUpto = doneTurns;
      }
    }

    const view: ConversationView = { turns: evalTurns, ficha: testFicha, requiredFields, funnelStage: null, quotesEnabled: cfg?.quotesEnabled ?? false, hasVideo: !!cfg?.presentationVideoUrl, vertical: cfg?.vertical ?? "servicos" };
    const evaluation = scoreConversation(view);
    writeFileSync(join(outDir, `${ct.id}.json`), JSON.stringify({ contactId: ct.id, name: ct.name, turns: log, fichaFinal: testFicha, evaluation }, null, 2));
    summary.push({ contactId: ct.id, name: ct.name, turns: turnsText.length, overall: evaluation.overall, errors, blocks, tools: [...toolsAll] });
    process.stdout.write(`✓ ${ct.name ?? ct.id.slice(-6)} · ${turnsText.length} turnos · nota ${evaluation.overall}${errors ? ` · ${errors} ERROS` : ""}${blocks ? ` · ${blocks} bloqueios` : ""}\n`);
  }

  summary.sort((a, b) => a.overall - b.overall);
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  const avg = summary.length ? summary.reduce((s, x) => s + x.overall, 0) / summary.length : 0;
  const totErr = summary.reduce((s, x) => s + x.errors, 0), totBlk = summary.reduce((s, x) => s + x.blocks, 0);
  console.log(`\n─── SIMULAÇÃO ─── ${summary.length} conversas · nota média ${Math.round(avg * 1000) / 1000} · ${totErr} erros · ${totBlk} bloqueios`);
  console.log(`Piores conversas (revisar):`);
  for (const s of summary.slice(0, 8)) console.log(`  ${(s.name ?? s.contactId.slice(-6)).padEnd(24)} nota ${s.overall} · ${s.turns} turnos${s.errors ? ` · ${s.errors} erros` : ""}`);
  console.log(`\nSaída completa (transcrições simuladas) em: ${outDir}/`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
