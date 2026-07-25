// ── Camada de Inteligência · Fase 3: motor de recomendações (determinístico) ────
// Transforma SINAIS agregados (avaliações da Fase 1, objeções, respostas sem fonte)
// em RECOMENDAÇÕES estruturadas — cada uma cumprindo o contrato de evidência do RFC
// (§5.6): evidência rastreável, volume+taxa, componente-alvo, impacto esperado e
// confiança. Puro/testável (recebe agregados, devolve recomendações). Observacional:
// nunca aplica nada — produz a fila para aprovação humana. Ver docs/rfc-camada-inteligencia.md.

export type TargetComponent = "catalogo" | "playbook" | "conhecimento" | "politica" | "midia" | "ficha" | "preco";

export interface RecoEvidence { contactId?: string; waMessageId?: string | null; excerpt: string }

export interface Recommendation {
  signature: string;                 // chave de dedupe estável (tipo + alvo)
  type: string;                      // dimensao_baixa | objecao_frequente | conhecimento_ausente
  title: string;                     // legível pro gestor
  targetComponent: TargetComponent;  // o que mudar
  evidence: RecoEvidence[];          // conversas concretas (drill-down)
  conversationCount: number;         // volume (conversas distintas)
  rate: number;                      // taxa = count / total (prioriza mais que o cru)
  confidence: number;                // 0..1 (cresce com volume/consistência)
  expectedImpact: { reach: number; basis: string }; // alcance honesto (§5.7)
  proposedChange: { summary: string };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const rnd = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
// Confiança: cresce com o volume (satura ~10 conversas). Nunca 1.0 (é hipótese).
export const confidenceFor = (count: number) => rnd(clamp01(0.4 + 0.5 * Math.min(1, count / 10)) * 0.95);
const conf = confidenceFor;

// ── Entradas agregadas (o runner monta do banco) ──────────────────────────────
export interface DimensionStat {
  dimension: string;                 // handoff | missedOpportunity | quoteTiming | ...
  lowConversations: RecoEvidence[];  // conversas com score baixo NESSA dimensão
}
export interface ObjectionStat { type: string; contactIds: string[]; avgSeverity: number }
export interface NoSourceStat { contactIds: string[]; samples: RecoEvidence[] }

export interface AggregatedSignals {
  totalConversations: number;
  windowDays: number;
  dimensions: DimensionStat[];   // da ConversationEvaluation (Fase 1)
  objections: ObjectionStat[];   // de LeadObjection
  noSource: NoSourceStat;        // conversas onde a IA não teve resposta (abster/sem fonte)
  minConversations?: number;     // limiar p/ virar recomendação (default 3)
}

// Mapa dimensão → como recomendar (componente-alvo + texto). Vertical Pack ajusta depois.
const DIM_META: Record<string, { target: TargetComponent; label: string; fix: string }> = {
  handoff: { target: "playbook", label: "a IA não acionou o vendedor quando o lead quis fechar/negociar", fix: "revisar o gatilho de handoff no playbook" },
  missedOpportunity: { target: "playbook", label: "sinais de compra/visita do lead ficaram sem resposta", fix: "reforçar a resposta a sinais de compra" },
  quoteTiming: { target: "playbook", label: "problemas no momento/sequência do orçamento", fix: "revisar o fluxo de orçamento" },
  discovery: { target: "ficha", label: "a IA fechou/orçou sem coletar os campos obrigatórios", fix: "reforçar a coleta da ficha antes de orçar" },
  videoTiming: { target: "midia", label: "o vídeo de apresentação não foi enviado no momento certo", fix: "ajustar o envio do vídeo na abertura" },
  policy: { target: "politica", label: "violações de política/afirmações sem fonte", fix: "revisar guardrails/conhecimento" },
};

export function buildRecommendations(s: AggregatedSignals): Recommendation[] {
  const min = s.minConversations ?? 3;
  const total = Math.max(1, s.totalConversations);
  const out: Recommendation[] = [];

  // 1) Dimensão da avaliação recorrentemente baixa (usa a Fase 1) — o mais acionável.
  for (const d of s.dimensions) {
    const count = d.lowConversations.length;
    if (count < min) continue;
    const meta = DIM_META[d.dimension] ?? { target: "playbook" as TargetComponent, label: `dimensão ${d.dimension} baixa`, fix: `revisar ${d.dimension}` };
    const rate = rnd(count / total);
    out.push({
      signature: `dimensao_baixa:${d.dimension}`,
      type: "dimensao_baixa",
      title: `Em ${count} conversas (${(rate * 100).toFixed(0)}%), ${meta.label}.`,
      targetComponent: meta.target,
      evidence: d.lowConversations.slice(0, 20),
      conversationCount: count, rate, confidence: rnd(conf(count)),
      expectedImpact: { reach: rate, basis: `afeta ~${(rate * 100).toFixed(0)}% das conversas (alcance); medir de verdade após a mudança` },
      proposedChange: { summary: meta.fix },
    });
  }

  // 2) Objeção frequente (de LeadObjection).
  for (const o of s.objections) {
    const count = o.contactIds.length;
    if (count < min) continue;
    const rate = rnd(count / total);
    out.push({
      signature: `objecao_frequente:${o.type}`,
      type: "objecao_frequente",
      title: `A objeção "${o.type}" apareceu em ${count} conversas (${(rate * 100).toFixed(0)}%).`,
      targetComponent: "playbook",
      evidence: o.contactIds.slice(0, 20).map((contactId) => ({ contactId, excerpt: `objeção ${o.type}` })),
      conversationCount: count, rate, confidence: rnd(conf(count)),
      expectedImpact: { reach: rate, basis: `${(rate * 100).toFixed(0)}% das conversas levantam essa objeção` },
      proposedChange: { summary: `preparar resposta padrão / ajuste de playbook para a objeção ${o.type}` },
    });
  }

  // 3) Conhecimento ausente (conversas onde a IA não teve resposta: abster/sem fonte).
  const noSrcCount = s.noSource.contactIds.length;
  if (noSrcCount >= min) {
    const rate = rnd(noSrcCount / total);
    out.push({
      signature: `conhecimento_ausente:geral`,
      type: "conhecimento_ausente",
      title: `Em ${noSrcCount} conversas (${(rate * 100).toFixed(0)}%), a IA não teve resposta (abster/sem fonte).`,
      targetComponent: "conhecimento",
      evidence: s.noSource.samples.slice(0, 20),
      conversationCount: noSrcCount, rate, confidence: rnd(conf(noSrcCount)),
      expectedImpact: { reach: rate, basis: `${(rate * 100).toFixed(0)}% das conversas batem num vazio de conhecimento` },
      proposedChange: { summary: "revisar as perguntas sem resposta e cadastrar conteúdo (RAG/FAQ) — clustering fino na Fase 4" },
    });
  }

  // Ordena por prioridade = impacto (alcance) × confiança (fórmula transparente do §5.7).
  return out.sort((a, b) => b.rate * b.confidence - a.rate * a.confidence);
}
