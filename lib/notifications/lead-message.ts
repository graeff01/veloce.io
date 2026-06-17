import { prisma } from "@/lib/prisma";
import { gateOnce, recipientsFor, claimDispatch } from "@/lib/notifications/dispatch";
import { esc } from "@/lib/notifications/digest";

// Notificação em tempo real: o lead mandou mensagem no WhatsApp.
// Cooldown por conversa (contato) para não spammar quando o lead manda várias
// mensagens seguidas: no máximo 1 disparo a cada COOLDOWN por contato.
const COOLDOWN_MS = 10 * 60 * 1000;

export async function notifyLeadMessage(opts: {
  clientId: string;
  contactId: string;
  contactName: string | null;
  text: string | null;
}): Promise<void> {
  const { clientId, contactId, contactName, text } = opts;

  // 1) Janela anti-spam (global por contato). gateOnce só passa 1x por janela.
  const bucket = Math.floor(Date.now() / COOLDOWN_MS);
  if (!(await gateOnce(`lead-msg:${contactId}:${bucket}`))) return;

  // 2) Quem optou por receber (time interno — todos têm acesso a todos os clientes hoje).
  const recipients = await recipientsFor("leadMessages");
  if (recipients.length === 0) return;

  // 3) Nome do cliente só agora (evita query quando ninguém escuta).
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const clientName = client?.name ?? "Cliente";

  // 3b) Origem do anúncio — identificada pelo referral (ad_id), NÃO pela mensagem.
  // Assim o time já sabe de qual anúncio/veículo o lead veio mesmo que ele não
  // tenha digitado o nome do veículo. Resolve o nome do anúncio pelo ID oficial;
  // cai para o modelo detectado / headline do anúncio quando ainda não há MetaAd.
  let origin: string | null = null;
  const lead = await prisma.waLead.findUnique({
    where: { contactId },
    select: { adId: true, adTitle: true, adModel: true },
  });
  if (lead) {
    if (lead.adId) {
      const meta = await prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } });
      if (meta) {
        const ad = await prisma.metaAd.findUnique({
          where: { connectionId_adId: { connectionId: meta.id, adId: lead.adId } },
          select: { name: true },
        });
        origin = ad?.name ?? null;
      }
    }
    origin = origin || lead.adModel || lead.adTitle || null;
  }

  const who = (contactName || "").trim() || "Lead";
  const snippet = (text || "").replace(/\s+/g, " ").trim().slice(0, 120) || "(mídia)";
  const originLine = origin ? `🎯 Anúncio: ${origin}` : null;

  const push = {
    title: `💬 ${who} — ${clientName}`,
    body: originLine ? `${originLine}\n${snippet}` : snippet,
    url: `/clients/${clientId}?tab=leads`,
  };
  const tg = `💬 <b>${esc(who)}</b> — ${esc(clientName)}\n${originLine ? `${esc(originLine)}\n` : ""}${esc(snippet)}`;

  await Promise.all(
    recipients.map((r) =>
      claimDispatch(
        `lead-msg:${contactId}:${bucket}:${r.userId}`,
        r.userId,
        "lead_message",
        push,
        tg,
        { pushEnabled: r.pushEnabled, telegramEnabled: r.telegramEnabled },
      ).catch(() => false),
    ),
  );
}
