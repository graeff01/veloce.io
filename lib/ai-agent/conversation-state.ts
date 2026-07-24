// ── Conversation State — eixo central de orquestração do Runtime (Fase 3) ──────
// Hoje o estágio da conversa é IMPLÍCITO (espalhado em slotState/scoreLead/funnelStage).
// Este componente torna o estado EXPLÍCITO e determinístico: uma projeção dos sinais que
// já existem. O estado NÃO decide o que a IA DIZ — decide o que o Runtime CARREGA (tools,
// conhecimento, módulos de prompt). É a base para stage-gating de tools (Capability Graph)
// e Composite Hydration, sem mudar o comportamento.
//
// Rollout (charter): AI_CONV_STATE=off (padrão) — nem calcula; comportamento atual.
//                    shadow — calcula e registra no log (contextUsed.agentState), observando.
// Vira authority só quando algum consumidor (tools/conhecimento) passar a depender dele,
// sempre com superconjunto + fallback pleno (segurança monotônica).
//
// Desacoplado por design: a derivação é PURA e testável; o grafo por vertical entra depois
// como dado (Vertical Pack). Este default serve automotivo E orçamento (churrasqueira).

export type AgentState =
  | "saudacao"               // 1º contato / sem sinal — abertura
  | "conhecendo"             // houve troca, ainda sem produto identificado
  | "identificando_produto"  // produto de interesse conhecido, qualificando
  | "orcamento"              // pronto p/ orçar (ficha modelo+cidade) ou orçamento em curso
  | "fechamento";            // negociação/fechamento (orçamento aprovado ou funil avançado)

export const AGENT_STATES: AgentState[] = ["saudacao", "conhecendo", "identificando_produto", "orcamento", "fechamento"];

// Sinais crus (o orquestrador extrai do que JÁ carrega — sem custo de modelo).
export interface StateSignals {
  isFirstTurn: boolean;
  hasProductInterest: boolean;   // LeadProfile.productInterest OU ficha com modelo
  quoteReady: boolean;           // ficha com modelo + cidade (clientes de orçamento)
  quoteInProgress: boolean;      // já existe um orçamento (rascunho/enviado)
  quoteApproved: boolean;        // cliente aprovou o orçamento
  funnelStage?: string | null;   // recebido|respondido|qualificado|negociacao|convertido|perdido
}

// Derivação determinística. Ordem: do estágio MAIS avançado para o menos (o primeiro que
// casar vence) — o lead nunca "regride" de estado por um sinal fraco.
export function deriveAgentState(s: StateSignals): AgentState {
  if (s.quoteApproved || s.funnelStage === "negociacao" || s.funnelStage === "convertido") return "fechamento";
  if (s.quoteInProgress || s.quoteReady) return "orcamento";
  if (s.hasProductInterest || s.funnelStage === "qualificado") return "identificando_produto";
  if (!s.isFirstTurn) return "conhecendo";
  return "saudacao";
}

export function agentStateMode(): "off" | "shadow" {
  return (process.env.AI_CONV_STATE || "off").toLowerCase() === "shadow" ? "shadow" : "off";
}
