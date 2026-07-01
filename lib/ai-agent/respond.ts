import { prisma } from "@/lib/prisma";
import { shouldRespond } from "./gatekeeper";
import { runAgent } from "./orchestrator";
import { globalSpendExceeded, clientSpendExceeded } from "./limits";
import { isOptOut, OPT_OUT_REPLY } from "./optout";
import { createEscalationTask } from "./escalation";
import { updateRollingMemory } from "./memory";
import { analyzeMessage } from "./intelligence";
import { evaluateResponse } from "./evaluation";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { isOperator, handleOperatorCommand } from "./operator";
import { sameBrazilNumber } from "@/lib/phone-br";
import { transcribeWhatsAppAudio } from "@/lib/transcribe";
import { applyMessageToConversation } from "@/lib/wa-conversation";
import { logWaEvent } from "@/lib/wa-events";

export interface JobPayload { text?: string | null; type: string; mediaId?: string; mime?: string }
export type JobOutcome = "sent" | "skipped" | "error";

interface RunnerInput {
  clientId: string;
  connectionId: string;
  contactId: string;
  idempotencyKey?: string;
  payload: JobPayload;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Divide a resposta da IA em até 3 bolhas por LINHA EM BRANCO (cadência humana).
// Sem linha em branco → 1 mensagem só (comportamento de antes).
function splitBlocks(text: string): string[] {
  const parts = text.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  return parts.length <= 1 ? [text.trim()] : parts.slice(0, 3);
}

async function sendWithRetry(conn: { phoneNumberId: string; accessToken: string }, to: string, text: string) {
  let last: { ok: boolean; waMessageId?: string; error?: string } = { ok: false };
  for (let a = 0; a < 2; a++) {
    last = await sendWhatsAppText(conn, to, text);
    if (last.ok) return last;
    await sleep(600 * (a + 1));
  }
  return last;
}

// Persiste a saída marcando aiGenerated=true (upsert: a marcação vence eventuais echoes).
async function storeOutbound(connectionId: string, contactId: string, waMessageId: string, text: string, ts: Date) {
  await prisma.waMessage.upsert({
    where: { connectionId_waMessageId: { connectionId, waMessageId } },
    create: { connectionId, contactId, waMessageId, direction: "out", type: "text", text, aiGenerated: true, timestamp: ts },
    update: { aiGenerated: true, text },
  }).catch(() => {});
  await applyMessageToConversation({ connectionId, contactId, direction: "out", timestamp: ts }).catch(() => {});
}

// Runner único do agente (chamado pela fila durável). Aplica TODAS as travas de
// segurança antes de gerar resposta. Retorna o desfecho para a fila decidir retry.
export async function runAgentJob(input: RunnerInput): Promise<JobOutcome> {
  const conn = await prisma.waConnection.findUnique({
    where: { id: input.connectionId },
    select: { id: true, clientId: true, phoneNumberId: true, accessToken: true },
  });
  if (!conn) return "skipped";
  const contact = await prisma.waContact.findUnique({
    where: { id: input.contactId },
    select: { id: true, name: true, waId: true, aiOptedOut: true, aiSilenced: true },
  });
  if (!contact) return "skipped";

  // Retry IDEMPOTENTE: se um attempt anterior JÁ gerou a resposta (mas o envio falhou),
  // apenas REENVIA a mesma — não re-roda o agente (evita re-gerar, re-mandar foto ou
  // perder a saudação/nome). Só respeita opt-out/silenciar.
  const pending = await prisma.aiJob.findUnique({ where: { contactId: contact.id }, select: { generatedReply: true } });
  if (pending?.generatedReply) {
    if (contact.aiOptedOut || contact.aiSilenced) return "skipped";
    const blocks = splitBlocks(pending.generatedReply);
    let ok = false;
    for (let i = 0; i < blocks.length; i++) {
      const r = await sendWithRetry(conn, contact.waId, blocks[i]);
      if (!r.ok) { if (i === 0) return "error"; break; }
      ok = true;
      await storeOutbound(conn.id, contact.id, r.waMessageId || `ia-${Date.now()}-${i}`, blocks[i], new Date());
      if (i < blocks.length - 1) await sleep(900);
    }
    return ok ? "sent" : "error";
  }

  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: conn.clientId } });

  // 0) Modo operador: se quem mandou é um número da triagem, NÃO é lead — entrega as
  //    fichas pendentes e retorna. A própria mensagem dela abre a janela de 24h, então
  //    respondemos free-form (sem template). Ignora horário comercial de propósito
  //    (a triadora trabalha de manhã). Só roda com a IA ligada e não pausada.
  if (cfg?.enabled && !cfg.paused && isOperator(cfg, contact.waId)) {
    return handleOperatorCommand({ conn, operatorWaId: contact.waId, operatorContactId: contact.id });
  }

  // 1) Gatekeeper: kill-switch global, pause por cliente, status live, fora do horário.
  const gate = shouldRespond(cfg);
  if (!gate.respond) return "skipped";

  // 2) Modo canário: responde SOMENTE os números de teste liberados (validação em PRD
  //    sem risco com cliente real). Tolera o 9º dígito do celular BR (canário/operador).
  if (cfg?.testMode) {
    const allowed = ((cfg.testNumbers as unknown as string[]) ?? []);
    if (!allowed.some((n) => sameBrazilNumber(n, contact.waId))) return "skipped";
  }

  // 3) Operador assumiu manualmente este contato → IA silenciada.
  if (contact.aiSilenced) return "skipped";

  // 4) Opt-out (LGPD) — trava determinística, independe do LLM.
  const inboundRaw = input.payload.text ?? "";
  if (contact.aiOptedOut) return "skipped";
  if (isOptOut(inboundRaw)) {
    await prisma.waContact.update({ where: { id: contact.id }, data: { aiOptedOut: true, aiOptedOutAt: new Date() } }).catch(() => {});
    const sent = await sendWithRetry(conn, contact.waId, OPT_OUT_REPLY);
    if (sent.ok) await storeOutbound(conn.id, contact.id, sent.waMessageId || `ia-optout-${Date.now()}`, OPT_OUT_REPLY, new Date());
    await logWaEvent(conn.id, "integration.error", contact.id, { message: "lead solicitou opt-out (IA silenciada)" }).catch(() => {});
    return sent.ok ? "sent" : "error";
  }

  // 3) Takeover humano: se um humano respondeu há pouco, a IA NÃO assume.
  const takeoverMin = cfg?.humanTakeoverMin ?? 180;
  if (takeoverMin > 0) {
    const human = await prisma.waMessage.findFirst({
      where: { contactId: contact.id, direction: "out", aiGenerated: false, timestamp: { gte: new Date(Date.now() - takeoverMin * 60_000) } },
      select: { id: true },
    });
    if (human) return "skipped"; // operador no controle
  }

  // 4) Escopo: ads_only responde apenas leads vindos de anúncio.
  if (cfg?.scopeMode === "ads_only") {
    const lead = await prisma.waLead.findUnique({ where: { contactId: contact.id }, select: { id: true } });
    if (!lead) return "skipped";
  }

  // 5) Tetos de custo (global e por cliente).
  if (await globalSpendExceeded()) {
    await logWaEvent(conn.id, "integration.error", contact.id, { message: "agente pausado: teto de gasto diário global atingido" }).catch(() => {});
    return "skipped";
  }
  if (cfg?.dailyUsdCap && (await clientSpendExceeded(conn.clientId, cfg.dailyUsdCap))) {
    await logWaEvent(conn.id, "integration.error", contact.id, { message: "agente pausado: teto de gasto diário do cliente atingido" }).catch(() => {});
    return "skipped";
  }

  // 6) Mídia: áudio é transcrito (segue como texto); imagem/doc viram marcador.
  let inboundText = input.payload.text ?? "";
  const mediaType = input.payload.type === "text" ? null : input.payload.type;
  if (input.payload.type === "audio" && input.payload.mediaId && cfg?.audioTranscription) {
    const transcript = await transcribeWhatsAppAudio(
      { accessToken: conn.accessToken },
      input.payload.mediaId, input.payload.mime,
    ).catch(() => null);
    if (transcript) {
      inboundText = transcript;
      await prisma.waMessage.updateMany({ where: { connectionId: conn.id, waMessageId: input.idempotencyKey ?? "" }, data: { text: transcript } }).catch(() => {});
    } else {
      inboundText = "[O lead enviou um áudio que não pôde ser transcrito]";
    }
  } else if (input.payload.type === "audio") {
    inboundText = inboundText || "[O lead enviou um áudio]";
  }
  if (mediaType === null && !inboundText.trim()) return "skipped";

  // 7) Gera a resposta (orquestrador: prompt + tools + guardrail + RAG + log).
  const out = await runAgent({
    clientId: conn.clientId, connectionId: conn.id,
    contact: { id: contact.id, name: contact.name, waId: contact.waId },
    inboundText, idempotencyKey: input.idempotencyKey, inboundMediaType: mediaType ?? undefined,
  });
  if (!out.reply) return "skipped"; // limite/desligado — nada a enviar

  // Cacheia a resposta no job: se o envio falhar, o retry REENVIA esta (não re-gera nem
  // re-manda foto, e preserva a saudação/nome). Removida quando o job é concluído/apagado.
  await prisma.aiJob.update({ where: { contactId: contact.id }, data: { generatedReply: out.reply } }).catch(() => {});

  // 8) Envia. A IA pode separar a resposta em até 3 bolhas (linha em branco) — cadência
  //    humana. Se a 1ª falhar, deixa a fila re-tentar; se falhar DEPOIS de já ter enviado
  //    algo, para sem re-enfileirar (evita duplicar mensagens ao lead).
  const blocks = splitBlocks(out.reply);
  let sent: { ok: boolean; waMessageId?: string; error?: string } = { ok: false };
  for (let i = 0; i < blocks.length; i++) {
    const r = await sendWithRetry(conn, contact.waId, blocks[i]);
    if (!r.ok) {
      await logWaEvent(conn.id, "integration.error", contact.id, { message: `envio IA falhou: ${r.error}` }).catch(() => {});
      if (i === 0) return "error";
      break;
    }
    sent = r;
    await storeOutbound(conn.id, contact.id, r.waMessageId || `ia-${Date.now()}-${i}`, blocks[i], new Date());
    if (i < blocks.length - 1) await sleep(900);
  }

  // Pipeline assíncrono (fora do caminho crítico): memória rolante + inteligência
  // (intent/sentiment/objeção da mensagem do lead). Nunca atrasa nem quebra o atendimento.
  void updateRollingMemory(contact.id, conn.clientId).catch(() => {});
  if (input.idempotencyKey) {
    void analyzeMessage({ clientId: conn.clientId, connectionId: conn.id, contactId: contact.id, waMessageId: input.idempotencyKey, text: inboundText }).catch(() => {});
  }
  // Self-improvement: avalia a qualidade da resposta da IA (juiz LLM, amostrado).
  void evaluateResponse({
    clientId: conn.clientId, contactId: contact.id, waMessageId: sent.waMessageId,
    leadMessage: inboundText, aiMessage: out.reply,
    promptVersion: out.promptVersion, promptVariant: out.promptVariant, model: out.model,
  }).catch(() => {});

  // 9) Se a IA escalou ou foi bloqueada pelo guardrail, garante rastro no board.
  if (out.decision === "escalou" || out.status === "blocked") {
    await createEscalationTask({
      clientId: conn.clientId, contactId: contact.id, contactName: contact.name, waId: contact.waId,
      reason: out.status === "blocked"
        ? "Uma resposta da IA foi bloqueada pelo guardrail (tentou tema proibido). Reveja e atenda."
        : "A IA encaminhou este lead para atendimento humano.",
      kind: "handoff",
    }).catch(() => {});
  }
  return "sent";
}
