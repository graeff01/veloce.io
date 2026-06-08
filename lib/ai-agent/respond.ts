import { prisma } from "@/lib/prisma";
import { shouldRespond } from "./gatekeeper";
import { runAgent } from "./orchestrator";
import { globalSpendExceeded } from "./limits";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { applyMessageToConversation } from "@/lib/wa-conversation";
import { logWaEvent } from "@/lib/wa-events";

interface Conn { id: string; clientId: string; phoneNumberId: string; accessToken: string }
interface Contact { id: string; name: string | null; waId: string }

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
export async function maybeRespondWithAgent(conn: Conn, contact: Contact, inboundText: string, idempotencyKey?: string): Promise<void> {
  try {
    if (!inboundText?.trim()) return;
    const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: conn.clientId } });
    const gate = shouldRespond(cfg);
    if (!gate.respond) return;

    // Contrato de idempotência: se esta mensagem já foi processada, não reprocessa
    // (dormente hoje pela serialização; pré-requisito da fila durável do N2).
    if (idempotencyKey) {
      const already = await prisma.aiInteraction.findFirst({ where: { clientId: conn.clientId, idempotencyKey }, select: { id: true } });
      if (already) return;
    }

    if (await globalSpendExceeded()) {
      await logWaEvent(conn.id, "integration.error", contact.id, { message: "agente pausado: teto de gasto diário global atingido" });
      return;
    }

    const out = await runAgent({
      clientId: conn.clientId, connectionId: conn.id,
      contact: { id: contact.id, name: contact.name, waId: contact.waId }, inboundText, idempotencyKey,
    });
    if (!out.reply) return; // limite/desligado — nada a enviar

    const sent = await sendWithRetry(conn, contact.waId, out.reply);
    if (!sent.ok) {
      await logWaEvent(conn.id, "integration.error", contact.id, { message: `envio IA falhou: ${sent.error}` });
      return;
    }

    const ts = new Date();
    await prisma.waMessage.create({ data: {
      connectionId: conn.id, contactId: contact.id, waMessageId: sent.waMessageId || `ia-${Date.now()}`,
      direction: "out", type: "text", text: out.reply, timestamp: ts,
    } }).catch(() => {});
    await applyMessageToConversation({ connectionId: conn.id, contactId: contact.id, direction: "out", timestamp: ts });
  } catch (e) {
    await logWaEvent(conn.id, "integration.error", contact.id, { message: `agente IA: ${String(e)}` }).catch(() => {});
  }
}
