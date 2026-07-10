import { prisma } from "@/lib/prisma";
import { isWindowOpen } from "@/lib/notifications/whatsapp-bot";
import { sendWhatsAppInteractiveButtons, sendWhatsAppText } from "@/lib/whatsapp-send";
import { sameBrazilNumber } from "@/lib/phone-br";
import type { WaIncomingMessage } from "@/lib/whatsapp";

// Frente 2 — "Fechou?" ao gestor. Custo-zero (hold-and-flush): a pergunta interativa só
// vai quando a janela de 24h do gestor está aberta; senão fica retida (status "pending")
// e é solta quando ele reabre a janela (flushPendingChecks) ou no próximo scan.

const STUCK_MS = 2 * 24 * 60 * 60 * 1000;  // parado em Negociação por 2 dias → pergunta
const REASK_MS = 2 * 24 * 60 * 60 * 1000;  // "ainda negociando" → repergunta em 2 dias
const MAX_REASKS = 3;                        // depois disso, para de perguntar

const VALUE_STALE_MS = 24 * 60 * 60 * 1000;  // venda confirmada sem valor por 24h → repergunta o valor
const MAX_VALUE_REASKS = 2;                   // no máx. 2 re-perguntas do valor, depois desiste

type Conn = { id: string; clientId: string; phoneNumberId: string; accessToken: string };
type Check = { id: string; contactId: string; recipientWaId: string; reaskCount: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Valor da venda em texto livre → número. Trata "45000", "R$ 45.000", "45.000,00", "45 mil".
function parseMoney(s: string): number | null {
  let t = s.toLowerCase().replace(/r\$/g, "").replace(/\s/g, "");
  const mil = t.match(/^(\d+(?:[.,]\d+)?)mil$/);
  if (mil) return Math.round(parseFloat(mil[1].replace(",", ".")) * 1000);
  if (t.includes(",")) { const [i, d] = t.split(","); t = i.replace(/\./g, "") + "." + (d ?? ""); }
  else t = t.replace(/\./g, ""); // pontos = separador de milhar
  const n = parseFloat(t.replace(/[^\d.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

// Gestor que recebe o "fechou?": prioriza role gestor, senão dono, senão o 1º ativo.
async function gestorWaFor(clientId: string): Promise<string | null> {
  const recips = await prisma.clientBotRecipient.findMany({
    where: { clientId, active: true, channel: "whatsapp", waId: { not: null } },
    select: { waId: true, role: true },
  });
  if (!recips.length) return null;
  const g = recips.find((r) => r.role === "gestor") ?? recips.find((r) => r.role === "dono") ?? recips[0];
  return g.waId ?? null;
}

// Monta e envia (ou retém) a pergunta interativa. Só envia se a janela estiver aberta.
async function sendOrHold(conn: Conn, check: Check): Promise<"sent" | "held"> {
  if (!(await isWindowOpen(conn.id, check.recipientWaId))) return "held"; // janela fechada → mantém pending

  const [contact, profile, lead] = await Promise.all([
    prisma.waContact.findUnique({ where: { id: check.contactId }, select: { name: true, displayName: true } }),
    prisma.leadProfile.findUnique({ where: { contactId: check.contactId }, select: { productInterest: true } }),
    prisma.waLead.findUnique({ where: { contactId: check.contactId }, select: { adModel: true, adTitle: true } }),
  ]);
  const name = (contact?.displayName || contact?.name || "o lead").trim();
  const product = profile?.productInterest || lead?.adModel || lead?.adTitle || null;
  const body = `E aí, ${name}${product ? ` (${product})` : ""} fechou?`;
  const buttons = [
    { id: `fc:${check.id}:sale`, title: "Vendeu" },
    { id: `fc:${check.id}:neg`, title: "Ainda negociando" },
    { id: `fc:${check.id}:lost`, title: "Perdeu" },
  ];
  const r = await sendWhatsAppInteractiveButtons(conn, check.recipientWaId, body, buttons);
  if (r.ok) {
    await prisma.funnelCheck.update({ where: { id: check.id }, data: { status: "sent", askedAt: new Date() } }).catch(() => {});
    return "sent";
  }
  return "held"; // falhou (número inválido/token) → segue pending, tenta no próximo scan
}

// CRON: acha leads parados em Negociação por 2 dias e dispara (ou retém) a pergunta.
export async function scanStuckNegotiations(): Promise<{ created: number; sent: number }> {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const now = new Date();
  const convs = await prisma.waConversation.findMany({
    where: { funnelStage: "negociacao", lastMessageAt: { lt: cutoff } },
    select: { contactId: true, connectionId: true },
    take: 500,
  });
  if (!convs.length) return { created: 0, sent: 0 };

  const connIds = [...new Set(convs.map((c) => c.connectionId))];
  const conns = await prisma.waConnection.findMany({
    where: { id: { in: connIds } },
    select: { id: true, clientId: true, phoneNumberId: true, accessToken: true },
  });
  const connById = new Map(conns.map((c) => [c.id, c as Conn]));
  const gestorByClient = new Map<string, string | null>();
  for (const c of conns) if (!gestorByClient.has(c.clientId)) gestorByClient.set(c.clientId, await gestorWaFor(c.clientId));

  let created = 0, sent = 0;
  for (const cv of convs) {
    const conn = connById.get(cv.connectionId);
    if (!conn) continue;
    const gestorWa = gestorByClient.get(conn.clientId);
    if (!gestorWa) continue;

    const existing = await prisma.funnelCheck.findUnique({ where: { contactId: cv.contactId } });
    let check: Check;
    if (!existing) {
      check = await prisma.funnelCheck.create({ data: { connectionId: conn.id, contactId: cv.contactId, recipientWaId: gestorWa, status: "pending" } });
      created++;
    } else if (existing.status === "pending") {
      check = existing; // retido — tenta enviar (janela pode ter reaberto)
    } else if (existing.status === "answered" && existing.response === "negociando" && existing.reaskAt && existing.reaskAt <= now && existing.reaskCount < MAX_REASKS) {
      check = await prisma.funnelCheck.update({ where: { id: existing.id }, data: { status: "pending", awaitingValue: false } });
    } else {
      continue; // sent/aguardando valor/done/reask-não-vencido → nada a fazer
    }
    if ((await sendOrHold(conn, check)) === "sent") sent++;
  }
  return { created, sent };
}

// Gestor reabriu a janela (mandou msg) → solta as perguntas retidas dele.
export async function flushPendingChecks(conn: Conn, gestorWaId: string): Promise<number> {
  const pend = await prisma.funnelCheck.findMany({ where: { connectionId: conn.id, status: "pending" }, take: 20 });
  let n = 0;
  for (const c of pend) {
    if (!sameBrazilNumber(c.recipientWaId, gestorWaId)) continue;
    if ((await sendOrHold(conn, c)) === "sent") n++;
  }
  return n;
}

async function processAction(conn: Conn, check: { id: string; contactId: string; reaskCount: number }, action: string, waId: string) {
  const now = new Date();
  if (action === "sale") {
    await prisma.waConversation.update({ where: { contactId: check.contactId }, data: { funnelStage: "convertido", funnelManual: true, saleConfirmedAt: now } }).catch(() => {});
    await prisma.funnelCheck.update({ where: { id: check.id }, data: { status: "answered", response: "vendeu", awaitingValue: true, answeredAt: now } });
    await sendWhatsAppText(conn, waId, "Boa! 🎉 Qual foi o valor da venda? (só o número, ex: 45000)");
  } else if (action === "neg") {
    await prisma.funnelCheck.update({ where: { id: check.id }, data: { status: "answered", response: "negociando", answeredAt: now, reaskAt: new Date(now.getTime() + REASK_MS), reaskCount: check.reaskCount + 1 } });
    await sendWhatsAppText(conn, waId, "Beleza, sigo de olho — te pergunto de novo em uns dias. 👊");
  } else if (action === "lost") {
    await prisma.waConversation.update({ where: { contactId: check.contactId }, data: { funnelStage: "perdido", funnelManual: true } }).catch(() => {});
    await prisma.funnelCheck.update({ where: { id: check.id }, data: { status: "done", response: "perdeu", answeredAt: now } });
    await sendWhatsAppText(conn, waId, "Poxa, que pena. Anotei como perdido. Bora pros próximos! 💪");
  }
}

// WEBHOOK: mensagem do GESTOR. Trata botão do "fechou?" e o valor da venda.
// Retorna true se consumiu a mensagem (não deve seguir como lead/IA).
export async function handleManagerFunnelReply(args: { conn: Conn; waId: string; message: WaIncomingMessage }): Promise<boolean> {
  const { conn, waId, message } = args;

  // 1) Toque no botão do "fechou?" (id = fc:<checkId>:<action>).
  const btnId = message.interactive?.button_reply?.id ?? message.button?.payload ?? null;
  if (btnId && btnId.startsWith("fc:")) {
    const [, checkId, action] = btnId.split(":");
    const check = await prisma.funnelCheck.findUnique({ where: { id: checkId }, select: { id: true, contactId: true, reaskCount: true } });
    if (check) await processAction(conn, check, action, waId);
    return true;
  }

  // 2) Valor da venda em texto livre (o gestor tem um check aguardando valor).
  const pending = await prisma.funnelCheck.findFirst({ where: { connectionId: conn.id, awaitingValue: true }, orderBy: { answeredAt: "desc" }, select: { id: true, contactId: true, recipientWaId: true } });
  if (pending && sameBrazilNumber(pending.recipientWaId, waId)) {
    const value = parseMoney(message.text?.body ?? "");
    if (value != null) {
      await prisma.waConversation.update({ where: { contactId: pending.contactId }, data: { saleValue: value } }).catch(() => {});
      await prisma.funnelCheck.update({ where: { id: pending.id }, data: { awaitingValue: false, status: "done" } });
      await sendWhatsAppText(conn, waId, `Anotado! ✅ Venda de ${brl(value)} registrada. Valeu! 🎉`);
    } else {
      await sendWhatsAppText(conn, waId, "Só me manda o valor da venda em número, ex: 45000 ou R$ 45.000 🙂");
    }
    return true;
  }

  return false; // não era interação do "fechou?" — segue o fluxo normal
}

// CRON: venda confirmada ("Vendeu") mas o gestor nunca informou o valor. Depois de
// 24h, repergunta UMA vez o valor (reusa o fluxo awaitingValue existente). Máx. 2
// tentativas; então desiste (saleValueGaveUp) para não perguntar pra sempre — mas
// mantém awaitingValue=true, de modo que um valor enviado tarde ainda é capturado.
export async function scanMissingSaleValues(): Promise<{ asked: number; gaveUp: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - VALUE_STALE_MS);

  // Todas as vendas aguardando valor (awaitingValue só é true no "Vendeu"). Inclui as
  // já desistidas para contar colisão por conexão (não agravar a desambiguação).
  const pend = await prisma.funnelCheck.findMany({
    where: { awaitingValue: true, response: "vendeu" },
    select: { id: true, connectionId: true, recipientWaId: true, answeredAt: true, valueReaskCount: true, valueReaskAt: true, saleValueGaveUp: true },
    take: 1000,
  });
  if (!pend.length) return { asked: 0, gaveUp: 0 };

  // Quantas perguntas de valor pendentes por conexão (bug conhecido de desambiguação:
  // o handler casa o valor por awaitingValue+answeredAt). Se >1 na mesma conexão, não
  // repergunta — só não piora o problema; resolvê-lo está fora do escopo.
  const pendByConn = new Map<string, number>();
  for (const c of pend) pendByConn.set(c.connectionId, (pendByConn.get(c.connectionId) ?? 0) + 1);

  const candidates = pend.filter((c) => !c.saleValueGaveUp);
  const connIds = [...new Set(candidates.map((c) => c.connectionId))];
  const conns = await prisma.waConnection.findMany({
    where: { id: { in: connIds } },
    select: { id: true, clientId: true, phoneNumberId: true, accessToken: true },
  });
  const connById = new Map(conns.map((c) => [c.id, c as Conn]));

  let asked = 0, gaveUp = 0;
  for (const check of candidates) {
    const conn = connById.get(check.connectionId);
    if (!conn) continue;

    // Gate 24h: conta a partir do último re-envio ou, na 1ª vez, da confirmação da venda.
    const anchor = check.valueReaskAt ?? check.answeredAt;
    if (anchor && anchor > cutoff) continue;

    // Estourou as tentativas → desiste (para de perguntar; mantém awaitingValue).
    if (check.valueReaskCount >= MAX_VALUE_REASKS) {
      await prisma.funnelCheck.update({ where: { id: check.id }, data: { saleValueGaveUp: true } }).catch(() => {});
      gaveUp++;
      continue;
    }

    // Não agravar a colisão: só repergunta se esta é a única pendência de valor da conexão.
    if ((pendByConn.get(check.connectionId) ?? 0) > 1) continue;

    // Hold-and-flush: só envia com a janela do gestor aberta.
    if (!(await isWindowOpen(conn.id, check.recipientWaId))) continue;

    const r = await sendWhatsAppText(conn, check.recipientWaId, "Ei! Faltou o valor daquela venda que você confirmou. Me manda só o número? (ex: 45000)");
    if (r.ok) {
      await prisma.funnelCheck.update({ where: { id: check.id }, data: { valueReaskCount: { increment: 1 }, valueReaskAt: now } }).catch(() => {});
      asked++;
    }
  }
  return { asked, gaveUp };
}
