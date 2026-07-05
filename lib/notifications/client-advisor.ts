import { getClientDashboard, periodRanges, type Period } from "@/lib/notifications/client-report";
import { buildImpact } from "@/lib/ai-agent/impact";
import { openaiChat } from "@/lib/openai";

// ── Consultor Veloce ──────────────────────────────────────────────────────────
// As 6 perguntas fixas são DETERMINÍSTICAS (zero custo, instantâneas). A pergunta
// LIVRE do dono passa por LLM, mas ANCORADA nos mesmos números reais — proibida de
// inventar. É a consultoria da Veloce codificada + um consultor que conversa.

export interface AdvisorItem { icon: string; q: string; a: string; tip?: string }
export interface AdvisorReply { greeting: string; items: AdvisorItem[] }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");
const plural = (n: number, s: string, p = s + "s") => (n === 1 ? s : p);

// Snapshot dos números REAIS do cliente + um bloco de fatos para ancorar a LLM.
async function gatherAdvisorContext(clientId: string, period: Period) {
  const { start, end } = periodRanges(period);
  const [d, impact] = await Promise.all([
    getClientDashboard(clientId, period),
    buildImpact(clientId, { start, end }),
  ]);
  const a = d.atendimento;
  const semResposta = Math.max(0, a.leads - a.respondidos);
  const custoPorVenda = a.conversoes > 0 && d.midia ? d.midia.spend / a.conversoes : null;
  const semRatio = a.leads > 0 ? semResposta / a.leads : 0;
  const convRate = a.leads > 0 ? a.conversoes / a.leads : 0;

  const periodoLabel = period === "week" ? "últimos 7 dias" : period === "month" ? "este mês" : "período";
  // Bloco de FATOS — só o que existe (números reais). A LLM só pode usar isto.
  const facts = [
    `Período: ${periodoLabel}.`,
    d.midia ? `Investimento em anúncios: ${brl(d.midia.spend)}.` : `Investimento em anúncios: sem dados.`,
    d.midia?.cpl != null ? `Custo por lead: ${brl(d.midia.cpl)}.` : null,
    `Leads recebidos: ${a.leads}.`,
    `Leads respondidos: ${a.respondidos} (${a.taxaResposta}%).`,
    `Leads sem resposta: ${semResposta}.`,
    a.tempoMedioMin != null ? `Tempo médio de 1ª resposta: ${int(a.tempoMedioMin)} min.` : null,
    `Vendas fechadas: ${a.conversoes}.`,
    convRate > 0 ? `Taxa de conversão lead→venda: ${(convRate * 100).toFixed(1)}%.` : null,
    custoPorVenda != null ? `Custo por venda: ${brl(custoPorVenda)}.` : null,
    a.deltaPct != null ? `Variação de leads vs. período anterior: ${a.deltaPct >= 0 ? "+" : ""}${a.deltaPct}%.` : null,
    d.bestCampaign ? `Anúncio com mais resultado: "${d.bestCampaign.name}" (${d.bestCampaign.leads} leads).` : null,
    `Leads atendidos pela IA fora do horário comercial: ${impact.leads.attended}.`,
  ].filter(Boolean).join("\n");

  return { d, impact, a, semResposta, custoPorVenda, semRatio, convRate, facts, hasData: a.leads > 0 };
}

export async function buildAdvisor(clientId: string, period: Period = "month"): Promise<AdvisorReply> {
  const { d, impact, a, semResposta, custoPorVenda, semRatio, convRate } = await gatherAdvisorContext(clientId, period);

  // "Como foi meu mês?" — dinheiro, leads, vendas, custo por venda, crescimento.
  const comoFoi = a.leads === 0
    ? "Ainda não houve movimento no período. Assim que os primeiros clientes chegarem, eu te mostro o resultado aqui."
    : `${d.midia ? `Você investiu ${brl(d.midia.spend)}, ` : ""}recebeu ${int(a.leads)} ${plural(a.leads, "lead")} e fechou ${int(a.conversoes)} ${plural(a.conversoes, "venda")}${custoPorVenda != null ? ` — ${brl(custoPorVenda)} por venda` : ""}.` +
      (a.deltaPct != null ? ` Isso é ${a.deltaPct >= 0 ? "+" : ""}${a.deltaPct}% de leads vs. o período anterior.` : "");

  // "Qual anúncio traz mais resultado?"
  const qualAnuncio = d.bestCampaign
    ? `Seu destaque é "${d.bestCampaign.name}", com ${int(d.bestCampaign.leads)} ${plural(d.bestCampaign.leads, "lead")}.${d.midia?.cpl != null ? ` Seu custo por lead está em ${brl(d.midia.cpl)}.` : ""}`
    : "Ainda não há dados de anúncio suficientes no período para eleger um destaque.";
  const qualAnuncioTip = d.bestCampaign ? "Vale concentrar verba no que já traz resultado e testar novos criativos parecidos com o campeão." : undefined;

  // "Meus leads estão sendo atendidos?"
  const atendidos = a.leads === 0
    ? "Sem leads no período para avaliar o atendimento."
    : `${a.taxaResposta}% dos leads foram respondidos${a.tempoMedioMin != null ? `, em ${int(a.tempoMedioMin)} min em média` : ""}. Sua IA atendeu ${int(impact.leads.attended)} ${plural(impact.leads.attended, "lead")} fora do horário comercial.`;

  // "Onde estou perdendo cliente?"
  const perdendo = a.leads === 0
    ? "Ainda não há leads para apontar gargalos."
    : semResposta > 0
      ? `${int(semResposta)} ${plural(semResposta, "lead")} ${plural(semResposta, "ficou", "ficaram")} sem resposta — é o ponto onde você mais perde venda hoje.`
      : "Ótimo: todos os leads do período foram respondidos. O foco agora é a qualidade do fechamento.";

  // "Estou crescendo?"
  const crescendo = a.deltaPct == null
    ? "Ainda não dá para comparar com o período anterior — na próxima janela eu te mostro a tendência."
    : a.deltaPct >= 5
      ? `Sim: seu volume de leads subiu ${a.deltaPct}% vs. o período anterior. Momento de acelerar.`
      : a.deltaPct <= -5
        ? `Atenção: seu volume de leads caiu ${Math.abs(a.deltaPct)}% vs. o período anterior — vale revisar a mídia.`
        : "Seu volume está estável vs. o período anterior.";

  // "O que faço pra vender mais?" — motor de regras (maior alavanca primeiro).
  let vender: string;
  if (a.leads === 0) vender = "Assim que os primeiros leads entrarem, eu aponto aqui a ação de maior impacto para você vender mais.";
  else if (semRatio >= 0.15) vender = `Priorize responder rápido: ${int(semResposta)} ${plural(semResposta, "lead")} sem resposta são vendas possíveis paradas. Comece por eles hoje.`;
  else if (a.tempoMedioMin != null && a.tempoMedioMin > 30) vender = `Acelere o primeiro contato: hoje sua resposta média está em ${int(a.tempoMedioMin)} min. Abaixo de 10 min converte bem mais.`;
  else if (convRate < 0.1) vender = "Você tem volume de leads, mas poucos viraram venda — o foco agora é o fechamento e o follow-up dos leads quentes.";
  else vender = "Você está no caminho certo — hora de escalar o investimento nos anúncios que mais trazem venda.";

  return {
    greeting: "Oi! Sou seu consultor Veloce. Toque numa pergunta e eu respondo com os seus números de verdade. 👇",
    items: [
      { icon: "📊", q: "Como foi meu mês?", a: comoFoi },
      { icon: "🚀", q: "O que faço pra vender mais?", a: vender },
      { icon: "📣", q: "Qual anúncio traz mais resultado?", a: qualAnuncio, tip: qualAnuncioTip },
      { icon: "🤖", q: "Meus leads estão sendo atendidos?", a: atendidos },
      { icon: "⚠️", q: "Onde estou perdendo cliente?", a: perdendo },
      { icon: "📈", q: "Estou crescendo?", a: crescendo },
    ],
  };
}

// ── Pergunta LIVRE do dono → resposta com IA, ANCORADA nos números reais ────────
// O gate anti-alucinação (irmão do gate do funil): a LLM só pode usar os FATOS
// fornecidos e é proibida de inventar número. Cache curto por instância p/ cortar
// repetição. gpt-4o-mini + snapshot minúsculo ≈ US$ 0,0002/pergunta.

const SYSTEM_ADVISOR =
  "Você é o Consultor Veloce, consultor de marketing e vendas do DONO de uma loja (varejo/automotivo). " +
  "Responda à pergunta do dono USANDO SOMENTE os DADOS fornecidos abaixo.\n" +
  "REGRAS INEGOCIÁVEIS:\n" +
  "1. Use os números EXATAMENTE como aparecem na lista. É PROIBIDO inventar, estimar ou CALCULAR " +
  "métricas que não estejam LITERALMENTE na lista (ex.: ticket médio, faturamento, receita, lucro, ROI, ROAS). " +
  "Mesmo que pareça uma conta fácil, NÃO faça — se o número pedido não está escrito na lista, responda com " +
  "honestidade que esse dado não está no painel e sugira o que olhar. Nunca apresente um número calculado como se fosse real.\n" +
  "2. Você PODE interpretar e relacionar os números que EXISTEM (ex.: explicar uma queda de vendas usando a " +
  "variação de leads e os leads sem resposta). Interpretar o que existe é permitido; inventar o que falta, não.\n" +
  "3. Cite o número real que embasa a resposta.\n" +
  "4. Nunca prometa nem garanta resultado futuro.\n" +
  "5. Tom de consultor próximo e direto, português do Brasil, no máximo 4 frases curtas. " +
  "Você fala com o DONO — foco em decisão e dinheiro, não em jargão.";

const answerCache = new Map<string, { answer: string; at: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 300);

export interface AdvisorAnswer { answer: string; grounded: boolean }

export async function answerAdvisorQuestion(clientId: string, period: Period, question: string): Promise<AdvisorAnswer> {
  const q = (question || "").trim();
  if (q.length < 2) return { answer: "Pode escrever a sua pergunta que eu respondo com os seus números. 😊", grounded: false };
  if (!process.env.OPENAI_API_KEY) {
    return { answer: "No momento não consigo responder perguntas abertas — toque numa das perguntas prontas acima que eu respondo na hora.", grounded: false };
  }

  const key = `${clientId}|${period}|${norm(q)}`;
  const cached = answerCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { answer: cached.answer, grounded: true };

  const { facts, hasData } = await gatherAdvisorContext(clientId, period);
  if (!hasData) {
    return { answer: "Ainda não houve movimento no período pra eu analisar. Assim que os primeiros leads entrarem, eu respondo suas perguntas com os números reais. 👍", grounded: false };
  }

  try {
    const { message } = await openaiChat({
      temperature: 0.3,
      maxTokens: 220,
      messages: [
        { role: "system", content: SYSTEM_ADVISOR },
        { role: "user", content: `DADOS DO CLIENTE (únicos números que você pode usar):\n${facts}\n\nPERGUNTA DO DONO: ${q.slice(0, 300)}` },
      ],
      meta: { clientId, pipeline: "intelligence", tenantKey: clientId },
    });
    const answer = (message.content || "").trim();
    if (!answer) return { answer: "Não consegui montar a resposta agora. Tenta de novo em instantes, ou toque numa das perguntas prontas.", grounded: false };
    answerCache.set(key, { answer, at: Date.now() });
    return { answer, grounded: true };
  } catch {
    return { answer: "Tive um problema pra responder agora. Tenta de novo em instantes — ou use as perguntas prontas acima. 🙏", grounded: false };
  }
}
