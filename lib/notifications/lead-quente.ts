import { prisma } from "@/lib/prisma";
import { sendClientAlert, waMe, excludedTokens, nameExcluded, botMsg } from "@/lib/notifications/client-bot";
import { gateOnce } from "@/lib/notifications/dispatch";
import { esc } from "@/lib/notifications/digest";
import { detectStageFromMessage } from "@/lib/wa-funnel";

// Alerta "🔥 Lead altamente qualificado" — vai para o BOT DO CLIENTE.
// Detecção SEM custo, cobre lead de ANÚNCIO e ORGÂNICO:
//   • o funil determinístico avançou para "negociação" (lead de anúncio), OU
//   • a própria mensagem tem sinal forte de fechamento (funciona p/ orgânico,
//     pois roda o detector direto no texto, sem o filtro de "só anúncio"), OU
//   • o LeadProfile da IA já marcou score alto / quente.
// 1x por lead.

const TEMP_LABEL: Record<string, string> = { hot: "Quente", warm: "Morno", cold: "Frio" };

export async function notifyLeadQuente(opts: { clientId: string; contactId: string; contactName: string | null; waId: string | null; text: string | null }): Promise<void> {
  const { clientId, contactId, contactName, waId, text } = opts;

  // Exclusão: família do dono / nomes marcados.
  const excl = await excludedTokens(clientId);
  if (nameExcluded(contactName, excl)) return;

  const [conv, profile, cfg] = await Promise.all([
    prisma.waConversation.findUnique({ where: { contactId }, select: { funnelStage: true } }),
    prisma.leadProfile.findUnique({
      where: { contactId },
      select: { score: true, temperature: true, productInterest: true, budget: true, wantsFinancing: true, visitIntent: true, readyToBuy: true },
    }),
    prisma.aiAgentConfig.findUnique({ where: { clientId }, select: { vertical: true } }),
  ]);

  const hotByStage = conv?.funnelStage === "negociacao";
  const hotByScore = (profile?.score ?? 0) >= 70 || profile?.temperature === "hot";
  // Orgânico/ad: sinal forte direto na mensagem (negociação = fechamento/financiar/proposta).
  const hotByMessage = detectStageFromMessage(text, cfg?.vertical, "in") === "negociacao";
  if (!hotByStage && !hotByScore && !hotByMessage) return;

  if (!(await gateOnce(`lead-quente:${contactId}`))) return; // 1x por lead

  const motivos: string[] = [];
  if (profile?.budget) motivos.push("Orçamento definido");
  if (profile?.productInterest) motivos.push(`Busca específica (${profile.productInterest})`);
  if (profile?.visitIntent || profile?.readyToBuy) motivos.push("Intenção de visita / fechamento");
  if (profile?.wantsFinancing) motivos.push("Pergunta sobre financiamento");
  if (motivos.length === 0) motivos.push("Sinais fortes de fechamento na conversa");

  const nome = (contactName || "").trim() || "Lead";
  const score = profile?.score && profile.score > 0 ? ` · Score ${profile.score}/100` : "";
  const temp = profile?.temperature && TEMP_LABEL[profile.temperature] ? ` · 🌡️ ${TEMP_LABEL[profile.temperature]}` : "";

  const wa = waMe(waId);
  const tg = botMsg("🔥 <b>Lead altamente qualificado</b>", [
    `👤 ${esc(nome)}${score}${temp}`,
    ...motivos.map((m) => `• ${esc(m)}`),
  ], wa ? { label: "💬 Responder no WhatsApp →", url: wa } : null);

  await sendClientAlert(clientId, "leadQuente", tg, { urgent: true }).catch(() => {});
}
