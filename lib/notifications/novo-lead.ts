import { prisma } from "@/lib/prisma";
import { sendClientAlert } from "@/lib/notifications/client-bot";
import { esc, APP_URL } from "@/lib/notifications/digest";

// Alerta "🚨 Novo lead" — vai para o BOT DO CLIENTE, só no 1º contato do lead.
// Idempotente por contato. Formato pensado pra clareza imediata: quem é, de onde
// veio e a 1ª mensagem.

function formatPhone(waId: string | null): string | null {
  if (!waId) return null;
  const d = waId.replace(/\D/g, "");
  // BR: 55 + DDD(2) + número(8-9)
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

// Origem legível a partir do WaLead (atribuição de anúncio já capturada no webhook).
function origem(lead: { adModel: string | null; adTitle: string | null; sourceType: string | null } | null): string {
  if (!lead) return "Orgânico / Direto";
  if (lead.adTitle || lead.adModel) return `Campanha Meta — ${lead.adTitle ?? lead.adModel}`;
  if (lead.sourceType === "message") return "Anúncio (Click-to-WhatsApp)";
  return "Orgânico / Direto";
}

export async function notifyNovoLead(opts: {
  clientId: string;
  contactId: string;
  contactName: string | null;
  waId: string | null;
  text: string | null;
}): Promise<void> {
  const { clientId, contactId, contactName, waId, text } = opts;

  // Só no PRIMEIRO contato: inboundCount === 1 logo após a 1ª mensagem entrar.
  const conv = await prisma.waConversation.findUnique({ where: { contactId }, select: { inboundCount: true } });
  if (!conv || conv.inboundCount !== 1) return;

  const lead = await prisma.waLead.findUnique({
    where: { contactId },
    select: { adModel: true, adTitle: true, sourceType: true },
  });

  const nome = (contactName || "").trim() || "Lead";
  const fone = formatPhone(waId);
  const primeira = (text || "").replace(/\s+/g, " ").trim().slice(0, 280) || "(mídia / sem texto)";
  const linha2 = [esc(nome), fone].filter(Boolean).join(" · ");

  const tg =
    `🚨 <b>Novo lead</b>\n` +
    `👤 ${linha2}\n` +
    `📍 Origem: ${esc(origem(lead))}\n` +
    `💬 Primeira mensagem:\n“${esc(primeira)}”\n\n` +
    `<a href="${APP_URL}/clients/${clientId}?tab=leads">Responder agora →</a>`;

  // "Novo lead" é importante: fura quiet hours (urgent) — é o evento âncora do produto.
  await sendClientAlert(clientId, "novoLead", tg, { urgent: true }).catch(() => {});
}
