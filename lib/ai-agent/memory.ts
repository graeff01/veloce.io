import { prismaUnscoped } from "@/lib/prisma";
import { openaiChat, type ChatMessage } from "@/lib/openai";

// ── Sprint 1: arquitetura de memória em 3 camadas ──────────────────────────────
// 1) Short-term: janela recente com ORÇAMENTO de tokens (não explode contexto).
// 2) Rolling summary: memória de trabalho incremental por conversa (agentMemory).
// 3) Long-term: LeadProfile estruturado (montado no orquestrador) + o resumo persistido,
//    que sobrevive entre sessões (lead que volta semanas depois é reconhecido).

// Heurística de tokens (~4 chars/token p/ pt-BR). Conservadora; serve para budget, não billing.
export const estimateTokens = (s: string | null | undefined) => Math.ceil((s?.length ?? 0) / 4);

// Seleciona as mensagens mais recentes que cabem no orçamento (mantém ordem cronológica).
// Garante ao menos 1 mensagem (a última) mesmo que estoure, para nunca ir vazio.
export function budgetedWindow(msgs: ChatMessage[], tokenBudget: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  let used = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = estimateTokens(typeof msgs[i].content === "string" ? (msgs[i].content as string) : "") + 4;
    if (used + t > tokenBudget && out.length > 0) break;
    out.push(msgs[i]);
    used += t;
  }
  return out.reverse();
}

const REFRESH_EVERY = Number(process.env.AI_MEMORY_REFRESH_EVERY || 6);
const MEMORY_MODEL = process.env.AI_MEMORY_MODEL || "gpt-4o-mini";

const SUMMARY_SYSTEM =
  `Você mantém a MEMÓRIA factual de um atendimento de vendas por WhatsApp.\n` +
  `Atualize o resumo abaixo com os fatos novos da conversa. Seja telegráfico e factual.\n` +
  `Capture só o que ajuda o vendedor/IA: veículo/produto de interesse, orçamento, troca (modelo/ano/km),\n` +
  `financiamento (entrada/prazo), urgência, objeções, quem decide, preferências e próximo passo.\n` +
  `NÃO invente. Mantenha o que ainda é verdadeiro, atualize o que mudou, remova redundância.\n` +
  `Responda APENAS o resumo atualizado, em tópicos curtos (máx ~120 palavras).`;

// Atualiza a memória rolante da conversa. Chamada PÓS-ENVIO (fora do caminho crítico do
// lead) e só quando acumulou turnos suficientes — controla custo e latência.
// Usa prismaUnscoped: roda no worker (sem contexto de request) e filtra por contactId,
// que é inerentemente single-tenant (pertence a uma conexão/cliente).
export async function updateRollingMemory(contactId: string, clientId?: string, model = MEMORY_MODEL): Promise<void> {
  const convo = await prismaUnscoped.waConversation.findUnique({
    where: { contactId }, select: { agentMemory: true, agentMemoryUpto: true },
  });
  if (!convo) return; // conversa ainda não materializada (o pipeline de mensagens cria)

  const total = await prismaUnscoped.aiInteraction.count({ where: { contactId } });
  if (total - (convo.agentMemoryUpto ?? 0) < REFRESH_EVERY) return; // ainda não vale o custo

  const history = await prismaUnscoped.waMessage.findMany({
    where: { contactId }, orderBy: { timestamp: "desc" }, take: 24, select: { direction: true, text: true },
  });
  const convoText = [...history].reverse().filter((m) => m.text)
    .map((m) => `${m.direction === "in" ? "Lead" : "Loja"}: ${m.text}`).join("\n");
  if (!convoText) return;

  const user = `RESUMO ATUAL:\n${convo.agentMemory || "(vazio)"}\n\nCONVERSA RECENTE:\n${convoText}`;
  let summary = "";
  try {
    const { message } = await openaiChat({
      model, temperature: 0.2, maxTokens: 220,
      messages: [{ role: "system", content: SUMMARY_SYSTEM }, { role: "user", content: user }],
      meta: { clientId, pipeline: "memory", tenantKey: clientId },
    });
    summary = (message.content || "").trim();
  } catch { return; } // memória é best-effort; nunca quebra o atendimento
  if (!summary) return;

  await prismaUnscoped.waConversation.update({
    where: { contactId },
    data: { agentMemory: summary, agentMemoryUpto: total, agentMemoryAt: new Date() },
  }).catch(() => {});
}
