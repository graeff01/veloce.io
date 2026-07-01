import { getClientDashboard, periodRanges, type Period } from "@/lib/notifications/client-report";
import { buildImpact } from "@/lib/ai-agent/impact";

// ── Consultor Veloce (determinístico, ZERO custo de LLM) ──────────────────────
// Responde as perguntas que todo dono faz, com números REAIS dele + uma
// recomendação por regra. Sem LLM → sem custo, instantâneo e sem risco de
// inventar número na frente do cliente. É a consultoria da Veloce codificada.

export interface AdvisorItem { icon: string; q: string; a: string; tip?: string }
export interface AdvisorReply { greeting: string; items: AdvisorItem[] }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");
const plural = (n: number, s: string, p = s + "s") => (n === 1 ? s : p);

export async function buildAdvisor(clientId: string, period: Period = "month"): Promise<AdvisorReply> {
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
