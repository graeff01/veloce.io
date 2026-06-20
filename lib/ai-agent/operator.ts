import { prismaUnscoped } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { buildFicha } from "./ficha";
import { sameBrazilNumber, brVariants } from "@/lib/phone-br";

// ── Modo Operador ──────────────────────────────────────────────────────────────
// A triadora (operador) NÃO é lead: ela recebe as FICHAS dos leads triados pela IA
// e distribui aos vendedores. Tudo dentro da janela de 24h aberta pela própria msg
// dela (free-form, sem template) — conforme docs/whatsapp-compliance.md.
//   PULL  (handleOperatorCommand): ela manda msg → devolve as fichas pendentes.
//   PUSH  (deliverReadyToOperators): tick agendado empurra as fichas PRONTAS
//         (lead HOT na hora ou conversa "assentada") p/ operador com janela aberta.

const SETTLE_MIN = 15;             // conversa assentada: lead parou de responder
const WINDOW_MS = 24 * 3600_000;   // janela de atendimento do operador
const MAX_BATCH = 15;              // teto de fichas por rajada
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
// entrega). readyOnly = só os "prontos": HOT (perecível) ou conversa assentada (>=15min).
export async function pendingFichas(clientId: string, operatorNumbers: string[], opts?: { readyOnly?: boolean }): Promise<Pending[]> {
  const connIds = await clientConnIds(clientId);
  if (!connIds.length) return [];
  const leads = await prismaUnscoped.waLead.findMany({ where: { connectionId: { in: connIds } }, select: { contactId: true } });
  const ids = [...new Set(leads.map((l) => l.contactId))];
  if (!ids.length) return [];
  const [convs, profiles, contacts] = await Promise.all([
    prismaUnscoped.waConversation.findMany({ where: { contactId: { in: ids }, lastInboundAt: { not: null } }, select: { contactId: true, fichaSentAt: true, lastInboundAt: true } }),
    prismaUnscoped.leadProfile.findMany({ where: { contactId: { in: ids } }, select: { contactId: true, temperature: true } }),
    prismaUnscoped.waContact.findMany({ where: { id: { in: ids } }, select: { id: true, waId: true } }),
  ]);
  const tempBy = new Map(profiles.map((p) => [p.contactId, p.temperature ?? "cold"]));
  const waIdBy = new Map(contacts.map((c) => [c.id, c.waId]));
  const settleCut = Date.now() - SETTLE_MIN * 60_000;
  let pend: Pending[] = convs
    .filter((c) => c.lastInboundAt && (!c.fichaSentAt || c.lastInboundAt > c.fichaSentAt))
    .map((c) => ({ contactId: c.contactId, waId: waIdBy.get(c.contactId) ?? "", temperature: tempBy.get(c.contactId) ?? "cold", lastInboundAt: c.lastInboundAt as Date }))
    .filter((p) => p.waId && !operatorNumbers.some((n) => sameBrazilNumber(n, p.waId))); // nunca o próprio operador
  if (opts?.readyOnly) pend = pend.filter((p) => p.temperature === "hot" || p.lastInboundAt.getTime() < settleCut);
  pend.sort((a, b) => (TEMP_RANK[a.temperature] ?? 2) - (TEMP_RANK[b.temperature] ?? 2) || b.lastInboundAt.getTime() - a.lastInboundAt.getTime());
  return pend;
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

// PULL: a triadora mandou mensagem → devolve TODAS as fichas pendentes (ela pediu).
export async function handleOperatorCommand(args: { conn: Conn; operatorWaId: string; operatorContactId?: string }): Promise<"sent" | "skipped" | "error"> {
  const { conn, operatorWaId, operatorContactId } = args;
  const cfg = await prismaUnscoped.aiAgentConfig.findUnique({ where: { clientId: conn.clientId }, select: { operatorNumbers: true } });
  const pend = await pendingFichas(conn.clientId, cfg?.operatorNumbers ?? []);
  if (!pend.length) {
    await sendWhatsAppText(conn, operatorWaId, "Nenhum lead novo desde a última vez 👍 Te aviso assim que entrar um.");
    return "sent";
  }
  await sendWhatsAppText(conn, operatorWaId, `📲 ${pend.length} lead(s) novo(s) — do mais quente pro mais frio:`);
  let ok = 0;
  for (const p of pend.slice(0, MAX_BATCH)) if (await deliverFicha(conn, operatorWaId, operatorContactId ?? null, p)) ok++;
  if (pend.length > MAX_BATCH) await sendWhatsAppText(conn, operatorWaId, `Tem mais ${pend.length - MAX_BATCH} lead(s). Manda "mais" que eu envio o resto.`);
  return ok > 0 ? "sent" : "error";
}

// Operadores com a JANELA ABERTA (mandaram msg < 24h) — alvo do push em tempo real.
async function openOperators(clientId: string, operatorNumbers: string[]): Promise<{ contactId: string; waId: string }[]> {
  if (!operatorNumbers.length) return [];
  const connIds = await clientConnIds(clientId);
  if (!connIds.length) return [];
  const variants = [...new Set(operatorNumbers.flatMap(brVariants))];
  const contacts = await prismaUnscoped.waContact.findMany({ where: { connectionId: { in: connIds }, waId: { in: variants } }, select: { id: true, waId: true } });
  if (!contacts.length) return [];
  const convs = await prismaUnscoped.waConversation.findMany({
    where: { contactId: { in: contacts.map((c) => c.id) }, lastInboundAt: { gte: new Date(Date.now() - WINDOW_MS) } },
    select: { contactId: true },
  });
  const open = new Set(convs.map((c) => c.contactId));
  return contacts.filter((c) => open.has(c.id)).map((c) => ({ contactId: c.id, waId: c.waId }));
}

// PUSH (Fase 2): varre clientes com operador e empurra as fichas PRONTAS (HOT na hora /
// conversa assentada) p/ os operadores com janela aberta. Chamado por tick agendado.
export async function deliverReadyToOperators(): Promise<{ delivered: number }> {
  const cfgs = await prismaUnscoped.aiAgentConfig.findMany({
    where: { enabled: true, paused: false, operatorNumbers: { isEmpty: false } },
    select: { clientId: true, operatorNumbers: true },
  });
  let delivered = 0;
  for (const cfg of cfgs) {
    const ops = await openOperators(cfg.clientId, cfg.operatorNumbers);
    if (!ops.length) continue; // janela fechada → fica pro próximo "pull"
    const ready = await pendingFichas(cfg.clientId, cfg.operatorNumbers, { readyOnly: true });
    if (!ready.length) continue;
    const conn = await prismaUnscoped.waConnection.findFirst({ where: { clientId: cfg.clientId }, select: { id: true, clientId: true, phoneNumberId: true, accessToken: true } });
    if (!conn) continue;
    for (const p of ready.slice(0, MAX_BATCH)) {
      let any = false;
      for (const op of ops) if (await deliverFicha(conn, op.waId, op.contactId, p)) any = true;
      if (any) delivered++;
    }
  }
  return { delivered };
}
