import { prismaUnscoped } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { buildFicha } from "./ficha";
import { sameBrazilNumber } from "@/lib/phone-br";

// ── Modo Operador (pull) ─────────────────────────────────────────────────────────
// A triadora (operador) NÃO é lead: ela recebe as FICHAS dos leads triados pela IA e
// distribui aos vendedores. Como a IA só atende FORA do horário comercial, todas as
// fichas nascem à noite e ACUMULAM. De manhã a triadora manda uma mensagem (abre a
// janela de 24h) e recebe o lote inteiro — free-form, sem template (docs/whatsapp-
// compliance.md). Nada de push intraday: das 9h-18h a IA está fora do ar e o vendedor
// atende ao vivo, então não há ficha nova a empurrar. O que não sair hoje entra no
// lote da manhã seguinte (nada se perde).

const MAX_BATCH = 15;              // teto de fichas por rajada (resto via "mais")
const TEMP_RANK: Record<string, number> = { hot: 0, warm: 1, cold: 2 };

type Conn = { id: string; clientId: string; phoneNumberId: string; accessToken: string };

export function isOperator(cfg: { operatorNumbers?: string[] } | null, waId: string): boolean {
  return (cfg?.operatorNumbers ?? []).some((n) => sameBrazilNumber(n, waId));
}

async function clientConnIds(clientId: string): Promise<string[]> {
  const conns = await prismaUnscoped.waConnection.findMany({ where: { clientId }, select: { id: true } });
  return conns.map((c) => c.id);
}

interface Pending { contactId: string; waId: string; temperature: string; lastInboundAt: Date }

// Leads de anúncio triados, ainda não entregues (ou com nova atividade desde a última
// entrega). Ordenados do mais quente pro mais frio.
export async function pendingFichas(clientId: string, operatorNumbers: string[]): Promise<Pending[]> {
  const connIds = await clientConnIds(clientId);
  if (!connIds.length) return [];
  const leads = await prismaUnscoped.waLead.findMany({ where: { connectionId: { in: connIds } }, select: { contactId: true } });
  const ids = [...new Set(leads.map((l) => l.contactId))];
  if (!ids.length) return [];
  const [convs, profiles, contacts, aiMsgs] = await Promise.all([
    prismaUnscoped.waConversation.findMany({ where: { contactId: { in: ids }, lastInboundAt: { not: null } }, select: { contactId: true, fichaSentAt: true, lastInboundAt: true } }),
    prismaUnscoped.leadProfile.findMany({ where: { contactId: { in: ids } }, select: { contactId: true, temperature: true } }),
    prismaUnscoped.waContact.findMany({ where: { id: { in: ids } }, select: { id: true, waId: true } }),
    // SÓ leads que a IA REALMENTE atendeu (tem msg aiGenerated) — não os que humano pegou.
    prismaUnscoped.waMessage.findMany({ where: { contactId: { in: ids }, direction: "out", aiGenerated: true }, select: { contactId: true }, distinct: ["contactId"] }),
  ]);
  const tempBy = new Map(profiles.map((p) => [p.contactId, p.temperature ?? "cold"]));
  const waIdBy = new Map(contacts.map((c) => [c.id, c.waId]));
  const aiAttended = new Set(aiMsgs.map((m) => m.contactId));
  return convs
    .filter((c) => aiAttended.has(c.contactId))                                   // só quem a IA atendeu
    .filter((c) => c.lastInboundAt && (!c.fichaSentAt || c.lastInboundAt > c.fichaSentAt))
    .map((c) => ({ contactId: c.contactId, waId: waIdBy.get(c.contactId) ?? "", temperature: tempBy.get(c.contactId) ?? "cold", lastInboundAt: c.lastInboundAt as Date }))
    .filter((p) => p.waId && !operatorNumbers.some((n) => sameBrazilNumber(n, p.waId))) // nunca o próprio operador
    .sort((a, b) => (TEMP_RANK[a.temperature] ?? 2) - (TEMP_RANK[b.temperature] ?? 2) || b.lastInboundAt.getTime() - a.lastInboundAt.getTime());
}

async function deliverFicha(conn: Conn, toWaId: string, toContactId: string | null, p: Pending): Promise<boolean> {
  const ficha = await buildFicha(conn.clientId, p.contactId);
  if (!ficha) return false;
  const text = `${ficha}\n👉 Falar com o lead: https://wa.me/${p.waId.replace(/\D/g, "")}`;
  const sent = await sendWhatsAppText(conn, toWaId, text);
  if (!sent.ok) return false;
  if (toContactId) {
    await prismaUnscoped.waMessage.create({ data: {
      connectionId: conn.id, contactId: toContactId, waMessageId: sent.waMessageId || `op-${Date.now()}-${p.contactId}`,
      direction: "out", type: "text", text, aiGenerated: true, timestamp: new Date(),
    } }).catch(() => {});
  }
  await prismaUnscoped.waConversation.update({ where: { contactId: p.contactId }, data: { fichaSentAt: new Date() } }).catch(() => {});
  return true;
}

// PULL: a triadora mandou mensagem → devolve TODAS as fichas pendentes (o lote da manhã).
export async function handleOperatorCommand(args: { conn: Conn; operatorWaId: string; operatorContactId?: string }): Promise<"sent" | "skipped" | "error"> {
  const { conn, operatorWaId, operatorContactId } = args;
  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({ where: { clientId: conn.clientId }, select: { operatorNumbers: true } });
  const pend = await pendingFichas(conn.clientId, cfg?.operatorNumbers ?? []);
  if (!pend.length) {
    await sendWhatsAppText(conn, operatorWaId, "Nenhum lead novo desde a última vez 👍");
    return "sent";
  }
  await sendWhatsAppText(conn, operatorWaId, `📲 ${pend.length} lead(s) novo(s) — do mais quente pro mais frio:`);
  let ok = 0;
  for (const p of pend.slice(0, MAX_BATCH)) if (await deliverFicha(conn, operatorWaId, operatorContactId ?? null, p)) ok++;
  if (pend.length > MAX_BATCH) await sendWhatsAppText(conn, operatorWaId, `Tem mais ${pend.length - MAX_BATCH} lead(s). Manda "mais" que eu envio o resto.`);
  return ok > 0 ? "sent" : "error";
}
