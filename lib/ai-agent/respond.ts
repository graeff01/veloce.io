import { prisma } from "@/lib/prisma";
import { shouldRespond, isWithinBusinessHours } from "./gatekeeper";
import { nowParts } from "@/lib/tz";
import type { Window } from "@/lib/visit-availability";
import { runAgent } from "./orchestrator";
import { globalSpendExceeded, clientSpendExceeded } from "./limits";
import { isOptOut, OPT_OUT_REPLY } from "./optout";
import { createEscalationTask } from "./escalation";
import { updateRollingMemory } from "./memory";
import { analyzeMessage } from "./intelligence";
import { extractQualification } from "./qualify-extract";
import { evaluateResponse } from "./evaluation";
import { sendWhatsAppText, sendWhatsAppMediaById, uploadWhatsAppMedia } from "@/lib/whatsapp-send";
import { isOperator, handleOperatorCommand, handoffToOperators } from "./operator";
import { matchWaBotRecipient } from "@/lib/notifications/whatsapp-bot";
import { handleWaBotInbound } from "@/lib/notifications/wa-bot-commands";
import { sameBrazilNumber } from "@/lib/phone-br";
import { transcribeWhatsAppAudio } from "@/lib/transcribe";
import { fetchWhatsAppImageDataUri } from "@/lib/whatsapp-media";
import { applyMessageToConversation } from "@/lib/wa-conversation";
import { logWaEvent } from "@/lib/wa-events";
import { isWithin24h } from "@/lib/wa-window";
import { isTakenOver } from "@/lib/takeover";
import { allowSend } from "@/lib/portal-send-throttle";

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

// Persiste a saída (upsert dedup por wamid: a marcação vence eventuais echoes).
// aiGenerated=true para respostas da IA; a resposta MANUAL de um humano pelo painel
// passa false — é o que aciona o takeover (respond.ts) e silencia o bot.
export async function storeOutbound(connectionId: string, contactId: string, waMessageId: string, text: string | null, ts: Date, aiGenerated = true, type = "text", sentByEmail: string | null = null) {
  await prisma.waMessage.upsert({
    where: { connectionId_waMessageId: { connectionId, waMessageId } },
    create: { connectionId, contactId, waMessageId, direction: "out", type, text, aiGenerated, timestamp: ts, sentByEmail },
    update: { aiGenerated, text },
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

  // 0b) Destinatário do bot no WhatsApp (dono): NÃO é lead. A mensagem dele reabre a janela
  //     de 24h → solta os alertas retidos e, se for comando (/quentes, /status…), responde.
  const ownerWaId = await matchWaBotRecipient(conn.clientId, contact.waId);
  if (ownerWaId) {
    await handleWaBotInbound({ clientId: conn.clientId, conn, ownerWaId, sendTo: contact.waId, text: input.payload.text ?? "" }).catch(() => {});
    return "skipped";
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

  // 3) Takeover humano: se um humano respondeu há pouco OU pausou a IA explicitamente
  //    (botão "Assumir"), a IA NÃO assume. A regra explícita vale ANTES da 1ª mensagem.
  const takeoverMin = cfg?.humanTakeoverMin ?? 180;
  if (takeoverMin > 0) {
    const human = await prisma.waMessage.findFirst({
      where: { contactId: contact.id, direction: "out", aiGenerated: false, timestamp: { gte: new Date(Date.now() - takeoverMin * 60_000) } },
      select: { id: true },
    });
    if (human) return "skipped"; // operador no controle (regra por mensagem)
    const convTk = await prisma.waConversation.findUnique({ where: { contactId: contact.id }, select: { humanTakeoverAt: true } });
    if (isTakenOver(convTk?.humanTakeoverAt, takeoverMin)) return "skipped"; // takeover explícito
  }

  // 4) Escopo efetivo (a quem responde). No modo "ads_in_hours" varia por horário:
  //    DENTRO do horário comercial → só anúncio; FORA → todos. Nos demais, usa scopeMode.
  let effectiveScope = cfg?.scopeMode ?? "all";
  if (cfg?.answerMode === "ads_in_hours") {
    const { weekday, minutes } = nowParts(cfg.timezone || "America/Sao_Paulo");
    const within = isWithinBusinessHours((cfg.businessHours as Window[]) ?? [], weekday, minutes);
    effectiveScope = within ? "ads_only" : "all";
  }
  if (effectiveScope === "ads_only") {
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

  // Vision (opt-in): baixa a imagem do lead p/ o modelo analisar.
  let inboundImages: string[] | undefined;
  if (cfg?.visionEnabled && input.payload.type === "image" && input.payload.mediaId) {
    const uri = await fetchWhatsAppImageDataUri({ accessToken: conn.accessToken }, input.payload.mediaId).catch(() => null);
    if (uri) inboundImages = [uri];
  }

  // 7) Gera a resposta (orquestrador: prompt + tools + guardrail + RAG + log).
  const out = await runAgent({
    clientId: conn.clientId, connectionId: conn.id,
    contact: { id: contact.id, name: contact.name, waId: contact.waId },
    inboundText, idempotencyKey: input.idempotencyKey, inboundMediaType: mediaType ?? undefined, inboundImages,
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

  // Handoff no WhatsApp: a IA qualifica e passa a bola pro vendedor entrar na conversa.
  //  • escalou (bateu numa parede) → manda a ficha pro vendedor na hora, em qualquer modo.
  //  • modo 24h + lead ficou QUENTE → manda a ficha pro vendedor assumir (só 1x por lead).
  // Se o vendedor responder o lead, o takeover humano já silencia a IA naquele contato.
  if (sent.ok) {
    // escalou OU bloqueado pelo guardrail (bateu numa parede: negociação/parcelas/"vou chamar
    // vendedor") → o vendedor é acionado DE VERDADE na hora (ficha), em qualquer modo.
    if (out.decision === "escalou" || out.status === "blocked") void handoffToOperators(conn, contact.id).catch(() => {});
    else if (cfg?.answerMode === "always" || cfg?.answerMode === "ads_in_hours") void handoffToOperators(conn, contact.id, { requireHot: true }).catch(() => {});
  }

  // Pipeline assíncrono (fora do caminho crítico): memória rolante + inteligência
  // (intent/sentiment/objeção da mensagem do lead). Nunca atrasa nem quebra o atendimento.
  void updateRollingMemory(contact.id, conn.clientId).catch(() => {});
  if (input.idempotencyKey) {
    void analyzeMessage({ clientId: conn.clientId, connectionId: conn.id, contactId: contact.id, waMessageId: input.idempotencyKey, text: inboundText }).catch(() => {});
  }
  // Backstop de qualificação: lê a conversa e preenche o perfil (garante a ficha completa),
  // mesmo que a IA não tenha chamado atualizar_perfil. Pula acks triviais (economia).
  if (!/^(ok|sim|n[aã]o|blz|beleza|obrigad\w*|valeu|certo|isso|uhum|t[aá] bom|pode ser)\W*$/i.test(inboundText.trim())) {
    void extractQualification(conn.clientId, contact.id, conn.id).catch(() => {});
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

// Acionamento MANUAL da IA a partir do painel (botão "IA responder"): o atendente vê um
// lead sem resposta e clica pra IA responder o que ele perguntou — IGNORA gatekeeper,
// horário e answerMode (é ação humana deliberada). Respeita opt-out (LGPD).
export async function manualAiReply(clientId: string, contactId: string): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const contact = await prisma.waContact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, waId: true, aiOptedOut: true, connection: { select: { id: true, clientId: true, phoneNumberId: true, accessToken: true } } },
  });
  if (!contact || contact.connection.clientId !== clientId) return { ok: false, error: "Conversa não encontrada." };
  if (contact.aiOptedOut) return { ok: false, error: "Este lead pediu para não receber mensagens (opt-out)." };
  const conn = contact.connection;

  const last = await prisma.waMessage.findFirst({ where: { contactId, direction: "in" }, orderBy: { timestamp: "desc" }, select: { text: true } });
  const inboundText = last?.text?.trim();
  if (!inboundText) return { ok: false, error: "Não há mensagem do lead para responder." };

  const out = await runAgent({ clientId, connectionId: conn.id, contact: { id: contact.id, name: contact.name, waId: contact.waId }, inboundText }, { autoMode: true });
  const reply = out.reply?.trim();
  // [SKIP]/escalou/bloqueado → a IA não tem o que responder (é do vendedor); não envia nada.
  if (!reply || reply.includes("[SKIP]") || out.decision === "escalou" || out.status === "blocked") {
    return { ok: false, error: "A IA não tem uma resposta para isso — é com o vendedor." };
  }

  const blocks = splitBlocks(reply);
  let ok = false;
  for (let i = 0; i < blocks.length; i++) {
    const r = await sendWithRetry(conn, contact.waId, blocks[i]);
    if (!r.ok) { if (i === 0) return { ok: false, error: `Falha no envio: ${r.error}` }; break; }
    ok = true;
    await storeOutbound(conn.id, contact.id, r.waMessageId || `ia-manual-${Date.now()}-${i}`, blocks[i], new Date());
    if (i < blocks.length - 1) await sleep(900);
  }
  void updateRollingMemory(contact.id, conn.clientId).catch(() => {});
  void extractQualification(conn.clientId, contact.id, conn.id).catch(() => {});
  return { ok, reply };
}

export interface ManualSendResult {
  ok: boolean;
  status?: number; // código HTTP sugerido em caso de recusa
  error?: string;
  message?: { id: string; text: string | null; direction: "out"; type: string; timestamp: string; aiGenerated: false };
}

export const MANUAL_SEND_MAX_LEN = 4096; // limite de texto da Cloud API

// Primeiro-a-responder vira DONO: só define assignedEmail se ainda estiver vazio (atômico).
async function assignIfUnowned(contactId: string, email: string | null) {
  if (!email) return;
  await prisma.waConversation.updateMany({ where: { contactId, assignedEmail: null }, data: { assignedEmail: email, assignedAt: new Date() } }).catch(() => {});
}

// Envio MANUAL de um humano (equipe do cliente) a partir do painel. Espelha o escopo
// de manualAiReply (contato tem que ser do próprio cliente → isolamento). Persiste com
// aiGenerated=false: é isso que aciona o takeover e silencia o bot (respond.ts). NÃO
// tenta template fora da janela de 24h — recusa com motivo claro (template é fora de escopo).
export async function sendManualMessage(clientId: string, contactId: string, rawText: string, sentByEmail: string | null = null): Promise<ManualSendResult> {
  const text = (rawText || "").trim();
  if (!text) return { ok: false, status: 400, error: "Escreva uma mensagem." };
  if (text.length > MANUAL_SEND_MAX_LEN) return { ok: false, status: 400, error: `Mensagem muito longa (máx ${MANUAL_SEND_MAX_LEN} caracteres).` };

  const contact = await prisma.waContact.findUnique({
    where: { id: contactId },
    select: { id: true, waId: true, aiOptedOut: true, connection: { select: { id: true, clientId: true, phoneNumberId: true, accessToken: true } } },
  });
  if (!contact || contact.connection.clientId !== clientId) return { ok: false, status: 404, error: "Conversa não encontrada." };
  if (contact.aiOptedOut) return { ok: false, status: 403, error: "Este lead pediu para não receber mensagens (opt-out)." };
  const conn = contact.connection;

  // Janela de 24h (autoritativo no servidor): última mensagem do LEAD.
  const lastIn = await prisma.waMessage.findFirst({ where: { contactId: contact.id, direction: "in" }, orderBy: { timestamp: "desc" }, select: { timestamp: true } });
  if (!isWithin24h(lastIn?.timestamp ?? null)) {
    return { ok: false, status: 409, error: "A janela de 24h fechou — o lead precisa mandar uma mensagem para reabrir a conversa." };
  }

  // Anti-flood por conversa.
  if (!allowSend(contact.id)) return { ok: false, status: 429, error: "Muitas mensagens seguidas. Aguarde um instante e tente de novo." };

  const sent = await sendWithRetry(conn, contact.waId, text);
  if (!sent.ok) return { ok: false, status: 502, error: `Falha no envio: ${sent.error ?? "erro desconhecido"}` };

  const ts = new Date();
  const wamid = sent.waMessageId || `hum-${Date.now()}`;
  await storeOutbound(conn.id, contact.id, wamid, text, ts, false, "text", sentByEmail);
  await assignIfUnowned(contact.id, sentByEmail); // 1ª resposta humana define o dono
  // Devolve o id do registro persistido (dedup do polling é por id).
  const stored = await prisma.waMessage.findUnique({ where: { connectionId_waMessageId: { connectionId: conn.id, waMessageId: wamid } }, select: { id: true, timestamp: true } });
  return {
    ok: true,
    message: { id: stored?.id ?? wamid, text, direction: "out", type: "text", timestamp: (stored?.timestamp ?? ts).toISOString(), aiGenerated: false },
  };
}

export const MANUAL_MEDIA_MAX_BYTES = 16 * 1024 * 1024; // teto seguro (imagem/doc/áudio)

// Envio MANUAL de MÍDIA (imagem/documento/áudio) pela equipe, a partir do painel.
// Mesmas travas do texto (isolamento, opt-out, janela de 24h, anti-flood). Faz upload
// na Cloud API e envia por mediaId. Persiste com aiGenerated=false (aciona o takeover).
export async function sendManualMedia(clientId: string, contactId: string, kind: "image" | "audio" | "document", buffer: Buffer, mime: string, filename?: string, caption?: string, sentByEmail: string | null = null): Promise<ManualSendResult> {
  if (!buffer?.length) return { ok: false, status: 400, error: "Arquivo vazio." };
  if (buffer.length > MANUAL_MEDIA_MAX_BYTES) return { ok: false, status: 400, error: "Arquivo muito grande (máx 16MB)." };

  const contact = await prisma.waContact.findUnique({
    where: { id: contactId },
    select: { id: true, waId: true, aiOptedOut: true, connection: { select: { id: true, clientId: true, phoneNumberId: true, accessToken: true } } },
  });
  if (!contact || contact.connection.clientId !== clientId) return { ok: false, status: 404, error: "Conversa não encontrada." };
  if (contact.aiOptedOut) return { ok: false, status: 403, error: "Este lead pediu para não receber mensagens (opt-out)." };
  const conn = contact.connection;

  const lastIn = await prisma.waMessage.findFirst({ where: { contactId: contact.id, direction: "in" }, orderBy: { timestamp: "desc" }, select: { timestamp: true } });
  if (!isWithin24h(lastIn?.timestamp ?? null)) return { ok: false, status: 409, error: "A janela de 24h fechou — o lead precisa mandar uma mensagem para reabrir a conversa." };
  if (!allowSend(contact.id)) return { ok: false, status: 429, error: "Muitas mensagens seguidas. Aguarde um instante e tente de novo." };

  const up = await uploadWhatsAppMedia(conn, buffer, filename || "arquivo", mime);
  if (!up.ok || !up.mediaId) return { ok: false, status: 502, error: `Falha no upload: ${up.error ?? "erro desconhecido"}` };

  const sent = await sendWhatsAppMediaById(conn, contact.waId, kind, up.mediaId, { filename, caption });
  if (!sent.ok) return { ok: false, status: 502, error: `Falha no envio: ${sent.error ?? "erro desconhecido"}` };

  const ts = new Date();
  const wamid = sent.waMessageId || `hum-media-${Date.now()}`;
  const text = (caption?.trim()) || (kind === "document" ? (filename || null) : null);
  await storeOutbound(conn.id, contact.id, wamid, text, ts, false, kind, sentByEmail);
  await assignIfUnowned(contact.id, sentByEmail);
  const stored = await prisma.waMessage.findUnique({ where: { connectionId_waMessageId: { connectionId: conn.id, waMessageId: wamid } }, select: { id: true, timestamp: true } });
  return {
    ok: true,
    message: { id: stored?.id ?? wamid, text, direction: "out", type: kind, timestamp: (stored?.timestamp ?? ts).toISOString(), aiGenerated: false },
  };
}

// Define/transfere/remove o DONO do lead. email=null desatribui. Valida que o atendente
// é um usuário do próprio cliente (PortalAccess). Mesmo isolamento por clientId.
export async function setAssignment(clientId: string, contactId: string, email: string | null): Promise<{ ok: boolean; status?: number; error?: string; assignedEmail?: string | null }> {
  const contact = await prisma.waContact.findUnique({ where: { id: contactId }, select: { id: true, connection: { select: { clientId: true } } } });
  if (!contact || contact.connection.clientId !== clientId) return { ok: false, status: 404, error: "Conversa não encontrada." };

  let target: string | null = null;
  if (email) {
    const e = email.trim().toLowerCase();
    const u = await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId, email: e } }, select: { email: true } });
    if (!u) return { ok: false, status: 400, error: "Atendente não encontrado." };
    target = u.email;
  }
  await prisma.waConversation.updateMany({ where: { contactId }, data: { assignedEmail: target, assignedAt: target ? new Date() : null } });
  return { ok: true, assignedEmail: target };
}

// Pausa ("Assumir") ou retoma ("Devolver pra IA") a IA nesta conversa. on=true silencia
// a IA na janela (antes mesmo da 1ª mensagem). Mesmo isolamento por clientId.
export async function setHumanTakeover(clientId: string, contactId: string, on: boolean): Promise<{ ok: boolean; status?: number; error?: string; humanTakenOver?: boolean }> {
  const contact = await prisma.waContact.findUnique({ where: { id: contactId }, select: { id: true, connection: { select: { id: true, clientId: true } } } });
  if (!contact || contact.connection.clientId !== clientId) return { ok: false, status: 404, error: "Conversa não encontrada." };
  await prisma.waConversation.upsert({
    where: { contactId: contact.id },
    create: { connectionId: contact.connection.id, contactId: contact.id, humanTakeoverAt: on ? new Date() : null },
    update: { humanTakeoverAt: on ? new Date() : null },
  });
  return { ok: true, humanTakenOver: on };
}

// Auto-resposta de lead SEM ATENDIMENTO (em horário comercial): se o lead ficou X min sem
// resposta (atendente não respondeu), a IA entra — MAS só responde o que ELA SABE (foto,
// km, preço, itens, local, horário). Se for do vendedor / ela não sabe, fica QUIETA (o
// autoMode devolve "[SKIP]" e não enviamos nada — não se mete nem diz "vou chamar"). 1x por
// mensagem do lead (autoRepliedAt). Respeita opt-out e operador que assumiu (aiSilenced).
const AUTO_REPLY_MIN = Number(process.env.AI_AUTO_REPLY_MIN || 10);   // min sem resposta
const AUTO_REPLY_MAX_H = Number(process.env.AI_AUTO_REPLY_MAX_H || 6); // não responde msg muito antiga

export async function autoReplyStalled(): Promise<{ replied: number }> {
  const cfgs = await prisma.aiAgentConfig.findMany({
    where: { enabled: true, paused: false, status: "live", answerMode: { in: ["always", "ads_in_hours"] } },
    select: { clientId: true, businessHours: true, timezone: true },
  });
  const now = Date.now();
  let replied = 0;
  for (const cfg of cfgs) {
    const hours = (cfg.businessHours as Window[]) ?? [];
    if (!hours.length) continue;
    const { weekday, minutes } = nowParts(cfg.timezone || "America/Sao_Paulo");
    if (!isWithinBusinessHours(hours, weekday, minutes)) continue; // auto-resposta é SÓ em horário comercial
    const connIds = (await prisma.waConnection.findMany({ where: { clientId: cfg.clientId }, select: { id: true } })).map((c) => c.id);
    if (!connIds.length) continue;
    const candidates = await prisma.waConversation.findMany({
      where: { connectionId: { in: connIds }, lastInboundAt: { gte: new Date(now - AUTO_REPLY_MAX_H * 3600_000), lte: new Date(now - AUTO_REPLY_MIN * 60_000) } },
      select: { contactId: true, lastInboundAt: true, lastOutboundAt: true, autoRepliedAt: true }, take: 100,
    });
    for (const c of candidates) {
      if (!c.lastInboundAt) continue;
      if (c.lastOutboundAt && c.lastOutboundAt >= c.lastInboundAt) continue; // já respondido (humano ou IA)
      if (c.autoRepliedAt && c.autoRepliedAt >= c.lastInboundAt) continue;   // já tentou nesta mensagem
      const contact = await prisma.waContact.findUnique({ where: { id: c.contactId }, select: { id: true, name: true, waId: true, aiOptedOut: true, aiSilenced: true, connection: { select: { id: true, clientId: true, phoneNumberId: true, accessToken: true } } } });
      if (!contact) continue;
      await prisma.waConversation.update({ where: { contactId: c.contactId }, data: { autoRepliedAt: new Date() } }).catch(() => {}); // marca ANTES (mesmo se skip)
      if (contact.aiOptedOut || contact.aiSilenced) continue;
      const last = await prisma.waMessage.findFirst({ where: { contactId: c.contactId, direction: "in" }, orderBy: { timestamp: "desc" }, select: { text: true } });
      const inboundText = last?.text?.trim();
      if (!inboundText) continue;

      const out = await runAgent({ clientId: contact.connection.clientId, connectionId: contact.connection.id, contact: { id: contact.id, name: contact.name, waId: contact.waId }, inboundText }, { autoMode: true }).catch(() => null);
      const reply = out?.reply?.trim();
      // Só envia se teve resposta CONCRETA: [SKIP]/escalou/bloqueado/vazio → fica quieta.
      if (!out || !reply || reply.includes("[SKIP]") || out.decision === "escalou" || out.status === "blocked") continue;
      const conn = contact.connection;
      const blocks = splitBlocks(reply);
      let ok = false;
      for (let i = 0; i < blocks.length; i++) {
        const r = await sendWithRetry(conn, contact.waId, blocks[i]);
        if (!r.ok) break;
        ok = true;
        await storeOutbound(conn.id, contact.id, r.waMessageId || `ia-auto-${Date.now()}-${i}`, blocks[i], new Date());
        if (i < blocks.length - 1) await sleep(900);
      }
      if (ok) { replied++; void extractQualification(conn.clientId, contact.id, conn.id).catch(() => {}); }
    }
  }
  return { replied };
}
