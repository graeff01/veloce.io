import { prismaUnscoped } from "@/lib/prisma";
import { openaiChat } from "@/lib/openai";

// ── Ficha do lead (handoff pro vendedor) ───────────────────────────────────────
// Monta um resumo PRONTO pro WhatsApp a partir de tudo que a IA levantou (memória,
// perfil/score, objeções, veículo de interesse). A base é DETERMINÍSTICA (campos +
// "como abordar") e nunca depende de LLM; por cima, uma SÍNTESE narrativa opcional
// (LLM, best-effort) dá o contexto de venda em 1 parágrafo. O qualificador copia e
// repassa ao vendedor. Genérico p/ qualquer vertical.

const SYNTH_SYSTEM =
  `Você resume um lead de venda por WhatsApp para o VENDEDOR assumir. ` +
  `Escreva UM parágrafo curto (2-3 frases), corrido e útil pra venda — o CONTEXTO, não campos soltos. ` +
  `Ex: "Cliente quer trocar o Onix 2019 dele por algo maior pra família, orçamento até 80 mil, decide até o fim do mês e já olhou outras 2 opções." ` +
  `Use SÓ fatos que aparecem nos dados; não invente nem suponha. Se houver pouca informação, seja breve e diga só o que se sabe.`;

// Gera a síntese narrativa a partir de perfil + memória + trechos da conversa. Best-effort:
// sem chave / erro / vazio → "" (a ficha determinística sai igual a antes). Fora do caminho
// crítico do lead (o handoff já é disparado com void).
export async function synthesizeNarrative(profileFacts: string, memory: string, history: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return "";
  const body = [profileFacts && `PERFIL:\n${profileFacts}`, memory && `RESUMO:\n${memory}`, history && `TRECHOS DA CONVERSA:\n${history}`].filter(Boolean).join("\n\n");
  if (body.trim().length < 20) return ""; // dados de menos pra valer uma síntese
  try {
    const { message } = await openaiChat({
      model: "gpt-4o-mini", temperature: 0.3, maxTokens: 160,
      messages: [{ role: "system", content: SYNTH_SYSTEM }, { role: "user", content: body }],
      meta: { pipeline: "memory" },
    });
    return (message.content || "").trim();
  } catch { return ""; }
}

const TEMP = { hot: "🔥 QUENTE", warm: "🌤️ MORNO", cold: "❄️ FRIO" } as const;
const SENT: Record<string, string> = {
  EXCITED: "😄 animado", HOT: "🔥 muito interessado", WARM: "🙂 interessado", COLD: "😐 frio",
  FRUSTRATED: "😤 frustrado", CONFUSED: "😕 com dúvidas", SKEPTICAL: "🤨 desconfiado",
  ANGRY: "😠 irritado", IMPATIENT: "⏳ impaciente",
};

// Sugestão de abordagem derivada dos sinais (explicável, sem LLM).
function approach(p: { temperature?: string | null; readyToBuy?: boolean | null; visitIntent?: boolean | null; budget?: string | null; hasTradeIn?: boolean | null; buyingPriority?: string | null; decisionStage?: string | null; lastSentiment?: string | null }, openObjections: string[]): string {
  const parts: string[] = [];
  if (p.temperature === "hot" || p.readyToBuy) parts.push("Lead quente e decidido — priorize o contato e confirme disponibilidade do veículo.");
  else if (p.temperature === "warm") parts.push("Lead morno — retome de onde a IA parou e aqueça antes de propor fechamento.");
  else parts.push("Lead ainda frio — vale uma abordagem de relacionamento, sem pressão.");
  if (p.decisionStage && /decidi/i.test(p.decisionStage)) parts.push("Já decidiu o modelo — pode ir direto à proposta/fechamento.");
  else if (p.decisionStage && /compar/i.test(p.decisionStage)) parts.push("Está comparando modelos — ajude a decidir destacando os diferenciais.");
  if (p.buyingPriority) parts.push(`O que mais pesa pra ele: ${p.buyingPriority} — conecte o argumento nisso.`);
  if (p.hasTradeIn) parts.push("Leve já a avaliação da troca.");
  if (p.budget) parts.push("Tenha proposta dentro do orçamento informado.");
  if (p.lastSentiment && /SKEPTICAL|FRUSTRATED|ANGRY|CONFUSED/i.test(p.lastSentiment)) parts.push("Lead com receio/insegurança — comece reduzindo a desconfiança (procedência, revisão, garantia).");
  if (openObjections.includes("PRICE")) parts.push("Atenção: objeção de PREÇO em aberto — prepare argumento de valor.");
  if (openObjections.includes("TRUST")) parts.push("Objeção de CONFIANÇA — reforce a procedência, a revisão e a garantia.");
  if (openObjections.includes("COMPETITOR")) parts.push("Está comparando com concorrência — destaque diferenciais.");
  return parts.join(" ");
}

export async function buildFicha(clientId: string, contactId: string): Promise<string | null> {
  const contact = await prismaUnscoped.waContact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, displayName: true, waId: true, connection: { select: { clientId: true } } },
  });
  if (!contact || contact.connection.clientId !== clientId) return null; // isolamento multi-tenant

  const [profile, convo, objections, lead, recent] = await Promise.all([
    prismaUnscoped.leadProfile.findUnique({ where: { contactId } }),
    prismaUnscoped.waConversation.findUnique({ where: { contactId }, select: { agentMemory: true, funnelStage: true } }),
    prismaUnscoped.leadObjection.findMany({ where: { contactId, resolved: false }, select: { type: true } }),
    prismaUnscoped.waLead.findUnique({ where: { contactId }, select: { adModel: true, adTitle: true } }),
    prismaUnscoped.waMessage.findMany({ where: { contactId }, orderBy: { timestamp: "desc" }, take: 16, select: { direction: true, text: true } }),
  ]);

  const who = contact.displayName?.trim() || contact.name?.trim() || contact.waId;
  const vehicle = lead?.adModel || lead?.adTitle || profile?.productInterest || "—";
  const temp = (profile?.temperature && TEMP[profile.temperature as keyof typeof TEMP]) || "❄️ FRIO";
  const openObj = objections.map((o) => o.type);

  const L: string[] = [];
  L.push(`🚗 LEAD — ${vehicle}  |  ${temp}${profile?.score != null ? ` (${profile.score})` : ""}`);
  L.push(`👤 ${who} — +${contact.waId}`);
  if (convo?.funnelStage) L.push(`📊 Funil: ${convo.funnelStage}`);
  L.push("");

  const facts: string[] = [];
  if (profile?.productInterest) facts.push(`• Interesse: ${profile.productInterest}`);
  if (profile?.budget) facts.push(`• Orçamento: ${profile.budget}`);
  if (profile?.hasTradeIn) facts.push(`• Troca: ${profile.tradeInDetail || "sim"}`);
  if (profile?.wantsFinancing) facts.push(`• Financiamento: ${profile.financingDetail || "tem interesse"}`);
  if (profile?.paymentMethod) facts.push(`• Pagamento: ${profile.paymentMethod}`);
  if (profile?.downPayment) facts.push(`• Entrada pretendida: ${profile.downPayment}`);
  if (profile?.urgency) facts.push(`• Urgência: ${profile.urgency}`);
  if (profile?.usageContext) facts.push(`• Uso/motivação: ${profile.usageContext}`);
  if (profile?.buyingPriority) facts.push(`• O que mais pesa: ${profile.buyingPriority}`);
  if (profile?.decisionStage) facts.push(`• Estágio: ${profile.decisionStage}`);
  if (profile?.lastSentiment) facts.push(`• Clima do lead: ${SENT[profile.lastSentiment] || profile.lastSentiment}`);
  // Síntese narrativa (LLM, best-effort): contexto de venda em 1 parágrafo, no topo da ficha.
  const historyText = [...recent].reverse().filter((m) => m.text).map((m) => `${m.direction === "in" ? "Lead" : "Loja"}: ${m.text}`).join("\n").slice(-2500);
  const narrative = await synthesizeNarrative(facts.join("\n"), convo?.agentMemory ?? "", historyText);
  if (narrative) { L.push("🧭 Contexto pro vendedor:"); L.push(narrative); L.push(""); }

  if (facts.length) { L.push("📋 O que se sabe:"); L.push(...facts); L.push(""); }

  // Alerta de qualificação financeira: nenhum sinal (pagamento/entrada/troca/orçamento/financiamento).
  const hasFinancialSignal = !!(profile?.budget || profile?.paymentMethod || profile?.downPayment || profile?.hasTradeIn || profile?.wantsFinancing != null);
  if (!hasFinancialSignal) { L.push("⚠️ SEM QUALIFICAÇÃO FINANCEIRA — lead não revelou pagamento/entrada/troca."); L.push(""); }

  if (convo?.agentMemory) { L.push("🧠 Resumo da conversa:"); L.push(convo.agentMemory); L.push(""); }
  if (openObj.length) { L.push(`⚠️ Objeções em aberto: ${openObj.join(", ")}`); L.push(""); }

  L.push(`💬 Como abordar: ${approach(profile ?? {}, openObj)}`);
  return L.join("\n");
}
