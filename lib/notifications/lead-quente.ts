import { prisma } from "@/lib/prisma";
import { sendClientAlert } from "@/lib/notifications/client-bot";
import { gateOnce } from "@/lib/notifications/dispatch";
import { esc, APP_URL } from "@/lib/notifications/digest";
import { detectStageFromMessage } from "@/lib/wa-funnel";

// Alerta "🔥 Lead altamente qualificado" — vai para o BOT DO CLIENTE.
// Detecção SEM custo, cobre lead de ANÚNCIO e ORGÂNICO:
//   • o funil determinístico avançou para "negociação" (lead de anúncio), OU
//   • a própria mensagem tem sinal forte de fechamento (funciona p/ orgânico,
//     pois roda o detector direto no texto, sem o filtro de "só anúncio"), OU
//   • o LeadProfile da IA já marcou score alto / quente.
// 1x por lead.

const TEMP_LABEL: Record<string, string> = { hot: "Quente", warm: "Morno", cold: "Frio" };

export async function notifyLeadQuente(opts: { clientId: string; contactId: string; contactName: string | null; text: string | null }): Promise<void> {
  const { clientId, contactId, contactName, text } = opts;

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

  const tg =
    `🔥 <b>Lead altamente qualificado</b>\n` +
    `👤 ${esc(nome)}${score}${temp}\n` +
    motivos.map((m) => `• ${esc(m)}`).join("\n") +
    `\n\n<a href="${APP_URL}/clients/${clientId}?tab=leads">Abrir conversa →</a>`;

  await sendClientAlert(clientId, "leadQuente", tg, { urgent: true }).catch(() => {});
}
