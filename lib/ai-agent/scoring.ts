// ── Sprint 2: Qualification Engine (determinístico, testável) ──────────────────
// Estado de slots e score v2 são funções PURAS sobre o perfil — sem efeitos, sem I/O.
// A IA conversa naturalmente, mas a verdade da qualificação é este estado explícito.

export interface ProfileLike {
  productInterest?: string | null;
  budget?: string | null;
  wantsFinancing?: boolean | null;
  hasTradeIn?: boolean | null;
  urgency?: string | null;
  visitIntent?: boolean | null;
  readyToBuy?: boolean | null;
}

export type SlotKey = "interesse" | "orcamento" | "financiamento" | "troca" | "urgencia" | "visita";

// Um slot está "preenchido" quando temos a informação (inclusive um "não" explícito).
export function slotState(p: ProfileLike): { filled: SlotKey[]; missing: SlotKey[] } {
  const has: Record<SlotKey, boolean> = {
    interesse: !!p.productInterest,
    orcamento: !!p.budget,
    financiamento: p.wantsFinancing != null,
    troca: p.hasTradeIn != null,
    urgencia: !!p.urgency,
    visita: p.visitIntent != null || p.readyToBuy != null,
  };
  const keys = Object.keys(has) as SlotKey[];
  return { filled: keys.filter((k) => has[k]), missing: keys.filter((k) => !has[k]) };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Urgência em 0..1 a partir do texto livre (palavras-chave pt-BR).
export function urgencyScore(urgency?: string | null): number {
  if (!urgency) return 0;
  const t = norm(urgency);
  if (/(hoje|agora|essa semana|esta semana|urgente|amanha|imediat|o quanto antes|\bja\b)/.test(t)) return 1;
  if (/(esse mes|este mes|proxima semana|quinzena|em breve|logo|alguns dias|alguns dia)/.test(t)) return 0.6;
  if (/(sem pressa|depois|mes que vem|ano que vem|so pesquisando|pesquisando|futuro|sem data|nao tenho pressa)/.test(t)) return 0.2;
  return 0.5; // mencionou prazo, mas não classificável
}

export interface LeadScore { score: number; temperature: "cold" | "warm" | "hot"; breakdown: { intent: number; urgency: number; engagement: number; budget: number } }

// Score v2 — ponderado por força do sinal, dinâmico (sobe conforme a conversa revela
// intenção/urgência/orçamento). Justificável: cada componente é 0..1, pesos somam 1.
export function scoreLead(p: ProfileLike): LeadScore {
  // Sinal forte: intenção explícita de compra/proposta (1) ou de visita (0.8).
  const intent = p.readyToBuy ? 1 : p.visitIntent ? 0.8 : 0;
  const urgency = urgencyScore(p.urgency);

  // Engajamento: profundidade da qualificação (slots respondidos) + interesse ativo.
  const answered = [p.budget != null && p.budget !== "", p.wantsFinancing != null, p.hasTradeIn != null, !!p.productInterest].filter(Boolean).length;
  const activeInterest = p.wantsFinancing === true || p.hasTradeIn === true ? 0.2 : 0;
  const engagement = Math.min(1, answered / 4 + activeInterest);

  const budget = p.budget ? 1 : 0;

  const raw = intent * 0.35 + urgency * 0.25 + engagement * 0.20 + budget * 0.20;
  const score = Math.round(raw * 100);
  const temperature = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return { score, temperature, breakdown: { intent, urgency, engagement, budget } };
}

// Rótulo amigável dos slots faltantes para guiar a condução natural da IA.
export const SLOT_LABEL: Record<SlotKey, string> = {
  interesse: "qual veículo/produto procura",
  orcamento: "faixa de valor que pretende investir",
  financiamento: "se pensa em financiar ou é à vista",
  troca: "se tem veículo na troca",
  urgencia: "prazo de compra (quando pretende decidir)",
  visita: "interesse em ver de perto / fechar",
};
