// Handler do inbound do DONO no WhatsApp (comandos + flush). Arquivo separado de
// whatsapp-bot.ts de propósito: ele importa client-report (→ client-bot → whatsapp-bot),
// então precisa ficar FORA de whatsapp-bot pra não fechar ciclo de import.

import { prisma } from "@/lib/prisma";
import { statusNow, quentesAguardando, resultadosHoje, resumoPeriodo, ajuda } from "@/lib/notifications/client-report";
import { getOrCreatePortal } from "@/lib/notifications/client-portal";
import { sendWhatsAppBotMessage, flushHeldAlerts } from "@/lib/notifications/whatsapp-bot";

interface WaBotInbound {
  clientId: string;
  conn: { phoneNumberId: string; accessToken: string };
  ownerWaId: string; // waId registrado do dono (p/ snooze e held)
  sendTo: string;    // waId que acabou de escrever (dentro da janela → envio grátis)
  text: string;
}

// O dono mandou mensagem: (1) solta os alertas retidos (reabriu a janela), (2) se for
// comando, responde na hora. Tudo dentro da janela = texto livre, custo zero.
export async function handleWaBotInbound(args: WaBotInbound): Promise<void> {
  const { clientId, conn, ownerWaId, sendTo, text } = args;

  // 1) Flush do que ficou retido enquanto a janela estava fechada.
  await flushHeldAlerts(clientId, ownerWaId, conn, sendTo).catch(() => {});

  // 2) Comando de consulta (reusa os builders — mesmos do painel/relatórios).
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
  if (!cmd.startsWith("/")) return; // não é comando → o flush já bastou

  let reply: string;
  if (cmd === "/status" || cmd === "/agora") reply = await statusNow(clientId);
  else if (cmd === "/quentes") reply = await quentesAguardando(clientId);
  else if (cmd === "/resultados" || cmd === "/hoje") reply = await resultadosHoje(clientId);
  else if (cmd === "/semana") reply = await resumoPeriodo(clientId, "week");
  else if (cmd === "/mes" || cmd === "/mês") reply = await resumoPeriodo(clientId, "month");
  else if (cmd === "/painel") { const p = await getOrCreatePortal(clientId); reply = `📊 <b>Seu painel</b>\n${p.link}`; }
  else if (cmd === "/silenciar") {
    const h = Math.min(24, Math.max(1, Number(text.trim().split(/\s+/)[1]) || 2));
    await prisma.clientBotRecipient.updateMany({
      where: { clientId, channel: "whatsapp", waId: ownerWaId },
      data: { mutedUntil: new Date(Date.now() + h * 3_600_000) },
    }).catch(() => {});
    reply = `🔕 Alertas pausados por ${h}h. Volto a avisar depois disso.`;
  }
  else reply = ajuda(null); // /ajuda, /help e desconhecidos

  await sendWhatsAppBotMessage(conn, sendTo, reply).catch(() => {});
}
