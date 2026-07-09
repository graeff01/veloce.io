import { prisma } from "@/lib/prisma";
import { shouldRespond } from "./gatekeeper";
import { runAgent } from "./orchestrator";
import { globalSpendExceeded } from "./limits";
import { claimInbound, markInboundDone, markInboundFailed } from "./inbound-ledger";
import { splitIntoMessages } from "./humanize";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { transcribeWhatsAppAudio } from "@/lib/transcribe";
import { fetchWhatsAppImageDataUri } from "@/lib/whatsapp-media";
import { applyMessageToConversation } from "@/lib/wa-conversation";
import { logWaEvent } from "@/lib/wa-events";

interface Conn { id: string; clientId: string; phoneNumberId: string; accessToken: string }
interface Contact { id: string; name: string | null; waId: string }
interface IncomingMsg { text: string | null; type: string; mediaId?: string; mime?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendWithRetry(conn: Conn, to: string, text: string) {
  let last: { ok: boolean; waMessageId?: string; error?: string } = { ok: false };
  for (let a = 0; a < 2; a++) {
    last = await sendWhatsAppText({ phoneNumberId: conn.phoneNumberId, accessToken: conn.accessToken }, to, text);
    if (last.ok) return last;
    await sleep(600 * (a + 1));
  }
  return last;
}

// Chamado pelo webhook (via scheduler) após uma mensagem recebida. Decide (gatekeeper),
// gera resposta (orquestrador), envia (Cloud API, com retry) e registra a saída.
// A IA só atua fora do horário, em produção e habilitada. Nunca deixa o lead no vácuo.
export async function maybeRespondWithAgent(conn: Conn, contact: Contact, msg: IncomingMsg, idempotencyKey?: string, opts?: { skipClaim?: boolean }): Promise<void> {
  try {
    const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: conn.clientId } });
    const gate = shouldRespond(cfg);
    if (!gate.respond) return;

    if (await globalSpendExceeded()) {
      await logWaEvent(conn.id, "integration.error", contact.id, { message: "agente pausado: teto de gasto diário global atingido" });
      return;
    }

    // Idempotência DURÁVEL: toma posse da mensagem (sobrevive a reinício). Se já foi
    // tratada (ou está sendo), não reprocessa. O worker de replay já tomou posse, por
    // isso pula o claim (skipClaim). Marcamos done/failed ao final.
    if (idempotencyKey && !opts?.skipClaim) {
      const claim = await claimInbound(conn.id, contact.id, idempotencyKey, { text: msg.text, type: msg.type, mediaId: msg.mediaId, mime: msg.mime });
      if (claim === "duplicate") return;
    }

    // ── Mídia (multimodal controlado) ──
    // Áudio: transcreve (speech→text) e segue pelo MESMO fluxo. Imagem/documento NÃO são
    // baixados nem analisados — o marcador de texto já basta para o agente reconhecer.
    let inboundText = msg.text ?? "";
    const mediaType = msg.type === "text" ? null : msg.type;
    if (msg.type === "audio" && msg.mediaId) {
      if (cfg?.audioTranscription) {
        const transcript = await transcribeWhatsAppAudio(conn, msg.mediaId, msg.mime);
        if (transcript) {
          inboundText = transcript;
          // Reflete a transcrição no histórico (visível p/ operadores).
          await prisma.waMessage.updateMany({ where: { connectionId: conn.id, waMessageId: idempotencyKey ?? "" }, data: { text: transcript } }).catch(() => {});
        } else {
          inboundText = "[O lead enviou um áudio que não pôde ser transcrito]";
        }
      }
      // Se a transcrição estiver desligada, mantém o marcador "[O lead enviou um áudio]".
    }
    if (mediaType === null && !inboundText.trim()) return; // texto vazio

    // F3 (vision): baixa a imagem do lead para o modelo analisar (quando habilitado).
    let inboundImages: string[] | undefined;
    if (cfg?.visionEnabled && msg.type === "image" && msg.mediaId) {
      const uri = await fetchWhatsAppImageDataUri(conn, msg.mediaId);
      if (uri) inboundImages = [uri];
    }

    const out = await runAgent({
      clientId: conn.clientId, connectionId: conn.id,
      contact: { id: contact.id, name: contact.name, waId: contact.waId }, inboundText, idempotencyKey, inboundMediaType: mediaType ?? undefined, inboundImages,
    });
    if (!out.reply) { // limite/desligado — nada a enviar, mas a mensagem foi tratada
      if (idempotencyKey) await markInboundDone(conn.id, idempotencyKey);
      return;
    }

    // F3 (naturalidade): quebra a resposta em mensagens curtas quando humanize está
    // ligado — como uma pessoa digitando. Senão, envia uma única mensagem (comportamento
    // atual, inalterado para quem não ativou).
    const parts = cfg?.humanize ? splitIntoMessages(out.reply) : [out.reply];
    let lastTs = new Date();
    for (let i = 0; i < parts.length; i++) {
      const sent = await sendWithRetry(conn, contact.waId, parts[i]);
      if (!sent.ok) {
        await logWaEvent(conn.id, "integration.error", contact.id, { message: `envio IA falhou: ${sent.error}` });
        if (idempotencyKey) await markInboundFailed(conn.id, idempotencyKey, `envio falhou: ${sent.error}`);
        return;
      }
      lastTs = new Date();
      await prisma.waMessage.create({ data: {
        connectionId: conn.id, contactId: contact.id, waMessageId: sent.waMessageId || `ia-${Date.now()}-${i}`,
        direction: "out", type: "text", text: parts[i], timestamp: lastTs,
      } }).catch(() => {});
      if (i < parts.length - 1) await sleep(700); // ritmo humano entre mensagens
    }
    await applyMessageToConversation({ connectionId: conn.id, contactId: contact.id, direction: "out", timestamp: lastTs });
    if (idempotencyKey) await markInboundDone(conn.id, idempotencyKey);
  } catch (e) {
    await logWaEvent(conn.id, "integration.error", contact.id, { message: `agente IA: ${String(e)}` }).catch(() => {});
    if (idempotencyKey) await markInboundFailed(conn.id, idempotencyKey, String(e));
  }
}
