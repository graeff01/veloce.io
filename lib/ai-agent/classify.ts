// ── Estágio consolidado de classificação pós-envio (Fase 1 do Runtime) ─────────
// Hoje, por mensagem do lead, o pós-envio dispara DUAS chamadas de modelo que leem a
// MESMA conversa e devolvem JSON estruturado:
//   1) analyzeMessage (intelligence.ts) — intent/sentiment/objeção da última mensagem
//   2) extractQualification (qualify-extract.ts) — ficha do lead (perfil) + score + funil
// Este módulo faz o trabalho das DUAS numa ÚNICA chamada e distribui para os MESMOS
// destinos no banco (MessageAnalysis, LeadProfile, LeadObjection, funil). Reduz a maior
// fonte de chamadas ao modelo (pipeline `intelligence`: ~6,6/turno em produção) sem
// mudar NADA que o cliente percebe — estes classificadores não geram texto de atendimento.
//
// Segurança/rollout (charter): controlado por AI_CONSOLIDATED_CLASSIFY:
//   "off"    (padrão) — não roda; comportamento ATUAL intacto (as 2 chamadas seguem).
//   "shadow" — roda a consolidada e LOGA o resultado p/ comparação; as 2 originais
//              continuam AUTORIDADE (escrevem). Custa +1 chamada (fase de validação).
//   "on"     — a consolidada é AUTORIDADE (escreve tudo); as 2 originais são puladas.
// Reversível por env var. Reusa taxonomias/validadores existentes (fonte única).

import { prismaUnscoped } from "@/lib/prisma";
import { openaiChat } from "@/lib/openai";
import {
  INTENTS, SENTIMENTS, OBJECTIONS, parseAnalysis, isAnalyzable, resolvesObjections,
  type Analysis,
} from "./intelligence";
import { scoreLead, funnelStageFor } from "./scoring";
import { applyProfileStage } from "./funnel-shadow";
import { mapQualifToProfile, type QualifExtract } from "./qualify-extract";

export type ClassifyMode = "off" | "shadow" | "on";
export function classifyMode(): ClassifyMode {
  const m = (process.env.AI_CONSOLIDATED_CLASSIFY || "off").toLowerCase();
  return m === "shadow" || m === "on" ? m : "off";
}

const MODEL = process.env.AI_INTEL_MODEL || "gpt-4o-mini";

// Prompt único = união FIEL dos dois prompts originais (intelligence.SYSTEM +
// qualify-extract.SYSTEM), sem afrouxar nenhuma regra. A saída cobre os dois blocos.
const SYSTEM =
  `Você analisa uma conversa de venda por WhatsApp (loja de veículos). Faça DUAS coisas e ` +
  `responda SOMENTE um JSON válido, sem texto fora dele:\n\n` +
  `A) CLASSIFIQUE A ÚLTIMA MENSAGEM DO LEAD em intent/sentiment/objeção.\n` +
  `   intent ∈ [${INTENTS.join(", ")}].\n` +
  `   sentiment ∈ [${SENTIMENTS.join(", ")}].\n` +
  `   objection ∈ [${OBJECTIONS.join(", ")}] ou null se não houver objeção.\n` +
  `   confidences e severity entre 0 e 1. Mensagem trivial → intent=null.\n\n` +
  `B) EXTRAIA A QUALIFICAÇÃO do LEAD a partir de TODA a conversa (use null quando o LEAD ` +
  `não deixou claro — NUNCA invente; considere só o que o LEAD falou, ignore o que a ` +
  `assistente ofereceu):\n` +
  `   produto, uso, orcamento (valor que o LEAD disse gastar, nunca o preço anunciado), ` +
  `financiamento(bool), financiamento_detalhe, troca(bool), troca_veiculo, urgencia, ` +
  `prioridade, estagio(pesquisando|comparando|decidido).\n\n` +
  `Formato EXATO:\n` +
  `{"intent":...,"intentConfidence":0..1,"sentiment":...,"sentimentConfidence":0..1,` +
  `"objection":... ,"objectionSeverity":0..1,` +
  `"produto":str|null,"uso":str|null,"orcamento":str|null,"financiamento":bool|null,` +
  `"financiamento_detalhe":str|null,"troca":bool|null,"troca_veiculo":str|null,` +
  `"urgencia":str|null,"prioridade":str|null,"estagio":str|null}`;

export interface ConsolidatedResult {
  analysis: Analysis | null;  // bloco A (só quando a última msg é analisável)
  qualif: QualifExtract;      // bloco B (bruto; mapeado via mapQualifToProfile — fonte única)
  raw: string;
}

// UMA chamada de modelo → resultado consolidado. Best-effort: null em erro.
export async function classifyConsolidated(p: {
  clientId: string; contactId: string; latestText: string; analyzable: boolean;
}): Promise<ConsolidatedResult | null> {
  const msgs = await prismaUnscoped.waMessage.findMany({
    where: { contactId: p.contactId }, orderBy: { timestamp: "desc" }, take: 30, select: { direction: true, text: true },
  });
  if (!msgs.some((m) => m.direction === "in" && m.text)) return null;
  const transcript = [...msgs].reverse().filter((m) => m.text)
    .map((m) => `${m.direction === "in" ? "LEAD" : "ASSISTENTE"}: ${m.text}`).join("\n").slice(-4000);

  let raw = "";
  try {
    const { message } = await openaiChat({
      model: MODEL, temperature: 0, maxTokens: 380,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `ÚLTIMA MENSAGEM DO LEAD: "${p.latestText.slice(0, 1000)}"\n\nCONVERSA:\n${transcript}` },
      ],
      meta: { clientId: p.clientId, pipeline: "intelligence", tenantKey: p.clientId },
    });
    raw = message.content || "";
  } catch { return null; }

  // Bloco A: só quando a última mensagem é analisável (mesmo gate do analyzeMessage).
  const analysis = p.analyzable ? parseAnalysis(raw) : null;

  let qualif: QualifExtract = {};
  try { qualif = JSON.parse(raw.replace(/```json|```/g, "").trim()) as QualifExtract; } catch { /* mantém {} */ }
  return { analysis, qualif, raw };
}

// AUTORIDADE: escreve EXATAMENTE o que analyzeMessage + extractQualification escreveriam.
// Chamado só quando mode="on". Idempotência da análise por waMessageId (igual ao original).
export async function applyConsolidated(p: {
  clientId: string; connectionId: string; contactId: string; waMessageId: string;
  result: ConsolidatedResult; writeAnalysis: boolean;
}): Promise<void> {
  const { analysis, qualif } = p.result;

  // ── Bloco A: MessageAnalysis + sentiment + objeção (só se analisável e ainda não gravada)
  if (p.writeAnalysis && analysis) {
    const exists = await prismaUnscoped.messageAnalysis.findUnique({ where: { waMessageId: p.waMessageId }, select: { id: true } }).catch(() => null);
    if (!exists) {
      await prismaUnscoped.messageAnalysis.create({
        data: {
          clientId: p.clientId, connectionId: p.connectionId, contactId: p.contactId, waMessageId: p.waMessageId,
          intent: analysis.intent, intentConfidence: analysis.intentConfidence,
          sentiment: analysis.sentiment, sentimentConfidence: analysis.sentimentConfidence,
        },
      }).catch(() => {});
      if (analysis.sentiment) {
        await prismaUnscoped.leadProfile.updateMany({ where: { contactId: p.contactId }, data: { lastSentiment: analysis.sentiment } }).catch(() => {});
      }
      if (analysis.objection) {
        const open = await prismaUnscoped.leadObjection.findFirst({ where: { contactId: p.contactId, type: analysis.objection, resolved: false }, select: { id: true } }).catch(() => null);
        if (!open) {
          await prismaUnscoped.leadObjection.create({
            data: { clientId: p.clientId, connectionId: p.connectionId, contactId: p.contactId, type: analysis.objection, severity: analysis.objectionSeverity, raisedMsgId: p.waMessageId },
          }).catch(() => {});
        }
      }
      if (resolvesObjections(analysis.intent, analysis.sentiment)) {
        await prismaUnscoped.leadObjection.updateMany({ where: { contactId: p.contactId, resolved: false }, data: { resolved: true, resolvedAt: new Date() } }).catch(() => {});
      }
    }
  }

  // ── Bloco B: LeadProfile + score + funil (mapper ÚNICO, compartilhado com qualify-extract)
  const data = mapQualifToProfile(qualif);
  if (!Object.keys(data).length) return;

  const prof = await prismaUnscoped.leadProfile.upsert({
    where: { contactId: p.contactId },
    create: { connectionId: p.connectionId, contactId: p.contactId, ...data },
    update: data,
  });
  const { score, temperature } = scoreLead(prof);
  await prismaUnscoped.leadProfile.update({ where: { contactId: p.contactId }, data: { score, temperature, qualified: temperature !== "cold" } }).catch(() => {});
  await applyProfileStage({ connectionId: p.connectionId, contactId: p.contactId, clientId: p.clientId, profileStage: funnelStageFor(prof) });
}

// Entrada única chamada pelo pós-envio. Encapsula o gate de modo (off/shadow/on) para
// respond.ts ficar limpo. Em "off" NÃO faz nada (o chamador segue com as 2 chamadas atuais).
export async function runConsolidatedClassify(p: {
  mode: ClassifyMode; clientId: string; connectionId: string; contactId: string;
  waMessageId: string; latestText: string;
}): Promise<void> {
  if (p.mode === "off") return;
  const analyzable = isAnalyzable(p.latestText);
  const result = await classifyConsolidated({ clientId: p.clientId, contactId: p.contactId, latestText: p.latestText, analyzable });
  if (!result) return;

  if (p.mode === "shadow") {
    // Só observa: loga o que ESCREVERIA, sem tocar no banco. As 2 chamadas atuais seguem
    // como autoridade. Compare este log com o resultado real para validar paridade.
    console.log(`[classify:shadow] contact=${p.contactId} analysis=${JSON.stringify(result.analysis)} qualif=${result.raw.slice(0, 400)}`);
    return;
  }
  // mode === "on": autoridade.
  await applyConsolidated({
    clientId: p.clientId, connectionId: p.connectionId, contactId: p.contactId,
    waMessageId: p.waMessageId, result, writeAnalysis: analyzable,
  });
}
