import { prisma } from "@/lib/prisma";
import { sendClientAlert, waMe, excludedTokens, nameExcluded, botMsg } from "@/lib/notifications/client-bot";
import { esc } from "@/lib/notifications/digest";

// Alerta "🚨 Novo lead" — vai para o BOT DO CLIENTE, só no 1º contato do lead.
// Idempotente por contato. Em pico (rajada), o individual é suprimido e vira
// digest agrupado (ver client-bot-jobs). Links apontam para FORA do sistema:
// "Responder" abre o WhatsApp do lead; "Painel" abre o /r do cliente.

const BURST_WINDOW_MS = 8 * 60 * 1000; // janela de rajada
const BURST_MAX = 3;                   // até 3 individuais por janela; o resto vira digest

function formatPhone(waId: string | null): string | null {
  if (!waId) return null;
  const d = waId.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

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

  // Só no PRIMEIRO contato.
  const conv = await prisma.waConversation.findUnique({ where: { contactId }, select: { inboundCount: true, connectionId: true } });
  if (!conv || conv.inboundCount !== 1) return;

  // Exclusão: família do dono / nomes marcados não viram lead.
  const excl = await excludedTokens(clientId);
  if (nameExcluded(contactName, excl)) return;

  // Anti-rajada: se já houve muitos leads novos nesta janela, suprime o individual
  // (o digest agrupado é enviado pelo agendador).
  const burst = await prisma.waConversation.count({ where: { connectionId: conv.connectionId, firstInboundAt: { gte: new Date(Date.now() - BURST_WINDOW_MS) } } });
  if (burst > BURST_MAX) return;

  const [lead, profile] = await Promise.all([
    prisma.waLead.findUnique({ where: { contactId }, select: { adModel: true, adTitle: true, sourceType: true } }),
    prisma.leadProfile.findUnique({ where: { contactId }, select: { productInterest: true, budget: true, wantsFinancing: true, visitIntent: true } }),
  ]);

  const nome = (contactName || "").trim() || "Lead";
  const fone = formatPhone(waId);
  const primeira = (text || "").replace(/\s+/g, " ").trim().slice(0, 280) || "(mídia / sem texto)";

  // Linha de perfil (só o que já se sabe).
  const perfil: string[] = [];
  if (profile?.productInterest) perfil.push(`Interesse: ${esc(profile.productInterest)}`);
  if (profile?.budget) perfil.push(`Orçamento: ${esc(profile.budget)}`);
  if (profile?.visitIntent) perfil.push("quer visitar");
  if (profile?.wantsFinancing) perfil.push("pergunta financiamento");

  const wa = waMe(waId);
  // Padrão: cabeçalho → contexto → 1 CTA (Responder no WhatsApp).
  const tg = botMsg("🚨 <b>Novo lead</b>", [
    `👤 ${[esc(nome), fone].filter(Boolean).join(" · ")}`,
    `📍 ${esc(origem(lead))}`,
    perfil.length ? `📋 ${perfil.join(" · ")}` : null,
    `💬 “${esc(primeira)}”`,
  ], wa ? { label: "💬 Responder no WhatsApp →", url: wa } : null);

  await sendClientAlert(clientId, "novoLead", tg, { urgent: true }).catch(() => {});
}
