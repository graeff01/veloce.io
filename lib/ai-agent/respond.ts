import { prisma } from "@/lib/prisma";
import { shouldRespond } from "./gatekeeper";
import { runAgent } from "./orchestrator";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { applyMessageToConversation } from "@/lib/wa-conversation";
import { logWaEvent } from "@/lib/wa-events";

interface Conn { id: string; clientId: string; phoneNumberId: string; accessToken: string }
interface Contact { id: string; name: string | null; waId: string }

// Chamado pelo webhook após uma mensagem recebida. Decide (gatekeeper),
// gera resposta (orquestrador), envia (Cloud API) e registra a saída.
// Tudo controlado e logado — a IA só atua fora do horário e se habilitada.
export async function maybeRespondWithAgent(conn: Conn, contact: Contact, inboundText: string): Promise<void> {
  try {
    if (!inboundText?.trim()) return;
    const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: conn.clientId } });
    const gate = shouldRespond(cfg, new Date());
    if (!gate.respond) return;

    const out = await runAgent({
      clientId: conn.clientId, connectionId: conn.id,
      contact: { id: contact.id, name: contact.name, waId: contact.waId }, inboundText,
    });
    if (!out.reply || out.status === "error") return;

    const sent = await sendWhatsAppText(
      { phoneNumberId: conn.phoneNumberId, accessToken: conn.accessToken },
      contact.waId, out.reply,
    );
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
