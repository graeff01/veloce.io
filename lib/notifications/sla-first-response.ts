import { prisma } from "@/lib/prisma";
import { recipientsFor, claimDispatch } from "@/lib/notifications/dispatch";
import { esc, APP_URL } from "@/lib/notifications/digest";
import { isWithinBusinessHours } from "@/lib/ai-agent/gatekeeper";
import { nowParts } from "@/lib/tz";
import type { Window } from "@/lib/visit-availability";

// SLA de 1º atendimento (enxuto): lead NOVO (1º contato de todos) que mandou
// mensagem e não teve 1ª resposta humana em SLA_MIN — só em horário comercial da
// agência e 1x por lead. Versão cuidadosa pra não poluir (o "+2h" antigo poluía):
// pega só o primeiro contato, janela curta de idade, e dedupe por conversa+dia.

const TZ = "America/Sao_Paulo";
const SLA_MIN = 15;    // alerta se passou disso sem 1ª resposta
const MAX_AGE_H = 6;   // ignora leads antigos — não adianta alertar tarde demais

// Horário comercial da AGÊNCIA (quem responde). Seg–Sex 09–18:30, Sáb 09–13.
const AGENCY_HOURS: Window[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:30" })),
  { weekday: 6, start: "09:00", end: "13:00" },
];

export async function runSlaFirstResponse(): Promise<{ sent: number }> {
  const p = nowParts(TZ);
  if (!isWithinBusinessHours(AGENCY_HOURS, p.weekday, p.minutes)) return { sent: 0 };

  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return { sent: 0 };

  const now = Date.now();
  const olderThan = new Date(now - SLA_MIN * 60 * 1000);
  const notBefore = new Date(now - MAX_AGE_H * 60 * 60 * 1000);

  // status "waiting" + firstResponseSec null = aguardando 1ª resposta.
  // firstInboundAt é o 1º contato de sempre (setado 1x) → "lead novo".
  const waiting = await prisma.waConversation.findMany({
    where: {
      status: "waiting",
      firstResponseSec: null,
      firstInboundAt: { gte: notBefore, lt: olderThan },
    },
    select: {
      contactId: true,
      firstInboundAt: true,
      contact: { select: { name: true } },
      connection: { select: { clientId: true, client: { select: { name: true } } } },
    },
  });
  if (waiting.length === 0) return { sent: 0 };

  const day = p.ymd;
  let sent = 0;
  for (const w of waiting) {
    const lead = (w.contact.name || "").trim() || "Lead";
    const clientName = w.connection.client.name;
    const clientId = w.connection.clientId;
    const mins = Math.round((now - (w.firstInboundAt as Date).getTime()) / 60000);
    const title = `⏰ Lead sem resposta — ${clientName}`;
    const body = `${lead} está esperando há ${mins}min sem resposta.`;
    const tg = `⏰ <b>Lead sem resposta</b> — ${esc(clientName)}\n<b>${esc(lead)}</b> está esperando há ${mins}min.\n\n<a href="${APP_URL}/clients/${clientId}?tab=leads">Responder →</a>`;
    for (const r of recipients) {
      // 1x por conversa por dia; claimDispatch re-tenta se o envio falhar.
      if (await claimDispatch(`sla-fr:${day}:${w.contactId}:${r.userId}`, r.userId, "sla_first_response",
        { title, body, url: `/clients/${clientId}?tab=leads` }, tg,
        { pushEnabled: r.pushEnabled, telegramEnabled: r.telegramEnabled })) sent++;
    }
  }
  return { sent };
}
