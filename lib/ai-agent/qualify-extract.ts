import { prismaUnscoped } from "@/lib/prisma";
import { openaiChat } from "@/lib/openai";
import { scoreLead, funnelStageFor } from "./scoring";
import { applyProfileStage } from "./funnel-shadow";

// ── Extração de qualificação (backstop determinístico da ficha) ─────────────────
// Problema: a ficha depende de a IA LEMBRAR de chamar atualizar_perfil durante o chat —
// e muitas vezes ela não chama, então a ficha sai vazia mesmo o lead tendo dito tudo.
// Solução: um passo assíncrono (pós-resposta, fora do caminho crítico) que lê a CONVERSA
// INTEIRA e preenche/complementa o LeadProfile. Assim a ficha SEMPRE reflete o que o lead
// revelou. Nunca inventa (só o que o LEAD deixou claro) e nunca sobrescreve com vazio.

const MODEL = process.env.AI_INTEL_MODEL || "gpt-4o-mini";

const SYSTEM = `Você extrai os dados de QUALIFICAÇÃO do LEAD a partir de um diálogo de loja de carros.
Responda SOMENTE um JSON válido com estas chaves (use null quando o LEAD não deixou claro — NUNCA invente):
{
 "produto": "veículo/modelo de interesse do lead ou null",
 "uso": "para que ele quer o carro (família, trabalho, 1º carro, viagem, dia a dia) ou null",
 "orcamento": "faixa de valor que o LEAD disse pretender gastar — NUNCA o preço do carro anunciado; se ele não citou um valor próprio, null",
 "financiamento": true|false|null,
 "financiamento_detalhe": "entrada/prazo que ele citou, ou null",
 "troca": true|false|null,
 "troca_veiculo": "modelo/ano/km do carro de troca dele, ou null",
 "urgencia": "prazo de compra (ex: 'essa semana', 'sem pressa') ou null",
 "prioridade": "o que MAIS pesa pra ele (preço, economia, segurança, espaço) ou null",
 "estagio": "pesquisando | comparando | decidido | null"
}
Considere SÓ o que o LEAD falou (ignore o que a assistente ofereceu). Só preencha com evidência clara no texto.`;

export interface QualifExtract {
  produto?: unknown; uso?: unknown; orcamento?: unknown; financiamento?: unknown; financiamento_detalhe?: unknown;
  troca?: unknown; troca_veiculo?: unknown; urgencia?: unknown; prioridade?: unknown; estagio?: unknown;
}

const qStr = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : undefined);
const qBool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

// Mapeia o JSON de qualificação → campos do LeadProfile. FONTE ÚNICA: usado tanto pelo
// backstop (extractQualification) quanto pelo classificador consolidado (classify.ts),
// pra os dois NUNCA divergirem. Só campos com evidência (nunca zera os já existentes).
export function mapQualifToProfile(ex: QualifExtract): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (qStr(ex.produto)) data.productInterest = qStr(ex.produto);
  if (qStr(ex.uso)) data.usageContext = qStr(ex.uso);
  if (qStr(ex.orcamento)) data.budget = qStr(ex.orcamento);
  const finDet = qStr(ex.financiamento_detalhe), fin = qBool(ex.financiamento);
  if (fin != null) data.wantsFinancing = fin; else if (finDet) data.wantsFinancing = true;
  if (finDet) data.financingDetail = finDet;
  const trDet = qStr(ex.troca_veiculo), tr = qBool(ex.troca);
  if (tr != null) data.hasTradeIn = tr; else if (trDet) data.hasTradeIn = true;
  if (trDet) data.tradeInDetail = trDet;
  if (qStr(ex.urgencia)) data.urgency = qStr(ex.urgencia);
  if (qStr(ex.prioridade)) data.buyingPriority = qStr(ex.prioridade);
  if (qStr(ex.estagio)) data.decisionStage = qStr(ex.estagio);
  return data;
}

export async function extractQualification(clientId: string, contactId: string, connectionId: string): Promise<void> {
  const msgs = await prismaUnscoped.waMessage.findMany({
    where: { contactId }, orderBy: { timestamp: "desc" }, take: 30, select: { direction: true, text: true },
  });
  if (!msgs.some((m) => m.direction === "in" && m.text)) return; // nada do lead pra extrair
  const transcript = [...msgs].reverse().filter((m) => m.text)
    .map((m) => `${m.direction === "in" ? "LEAD" : "ASSISTENTE"}: ${m.text}`).join("\n").slice(-4000);

  let ex: QualifExtract | null = null;
  try {
    const { message } = await openaiChat({
      model: MODEL, temperature: 0, maxTokens: 300,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: transcript }],
      meta: { clientId, pipeline: "intelligence", tenantKey: clientId },
    });
    ex = JSON.parse((message.content || "").replace(/```json|```/g, "").trim());
  } catch { return; }
  if (!ex || typeof ex !== "object") return;

  const data = mapQualifToProfile(ex);
  if (!Object.keys(data).length) return; // nada de novo

  const prof = await prismaUnscoped.leadProfile.upsert({
    where: { contactId },
    create: { connectionId, contactId, ...data },
    update: data, // só os campos extraídos — nunca zera os já existentes
  });
  const { score, temperature } = scoreLead(prof);
  await prismaUnscoped.leadProfile.update({ where: { contactId }, data: { score, temperature, qualified: temperature !== "cold" } }).catch(() => {});

  // Funil pela AUTORIDADE única (avanço-only; respeita trava manual/terminais/exclusão).
  await applyProfileStage({ connectionId, contactId, clientId, profileStage: funnelStageFor(prof) });
}
