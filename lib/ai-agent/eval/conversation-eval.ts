// ── Camada de Inteligência · Fase 1: Avaliador determinístico de conversa ──────
// Scorers PUROS (evento da conversa → score + evidência), sem banco e sem modelo.
// Medem se a IA executou o esperado, usando SÓ sinais que o Runtime já emite.
// Observacional: não decide nada, não altera comportamento — só produz a avaliação.
// Ver docs/rfc-camada-inteligencia.md §12. Cada score é 0..1 (ou null = não-aplicável);
// toda dimensão carrega EVIDÊNCIA rastreável (turno + mensagem + motivo).

export const RUBRIC_VERSION = "det-v1";

export interface EvalEvidence { turn: number; waMessageId?: string | null; excerpt: string; reason: string }
export interface DimensionResult { score: number | null; status: string; evidence: EvalEvidence[] } // score null = N/A

// Turno normalizado (o loader monta a partir de AiInteraction + MessageAnalysis).
export interface EvalTurn {
  inbound: string | null;
  outbound: string | null;
  decision: string | null;          // respondeu_duvida | escalou | orcou | bloqueado | ...
  status: string;                   // ok | blocked | error | skipped
  guardrails: string[];             // ex.: "grounding:preco_sem_fonte:enforced", "verify:unsupported"
  tools: { name: string; result?: string | null }[];
  intent: string | null;            // MessageAnalysis.intent da mensagem do lead
  waMessageId?: string | null;
}

export interface ConversationView {
  turns: EvalTurn[];
  ficha: Record<string, unknown>;                 // LeadProfile.data (intake coletada)
  requiredFields: { key: string; label: string }[]; // campos obrigatórios do intakeSpec
  funnelStage: string | null;
  quotesEnabled: boolean;
  hasVideo: boolean;                              // presentationVideoUrl configurado
  vertical: string;
}

export interface ConversationEvalResult {
  overall: number;
  confidence: number;
  dimensions: Record<string, DimensionResult>;
  method: "deterministic";
  rubricVersion: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const excerpt = (s: string | null | undefined, n = 80) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const has = (t: EvalTurn, tool: string) => t.tools.some((x) => x.name === tool);
const HIGH_INTENT = new Set(["BUYING_SIGNAL", "READY_TO_CLOSE", "VISIT_INTENT", "PRICE_NEGOTIATION"]);
const QUOTE_INTENT = new Set(["PRICE_QUESTION", "BUYING_SIGNAL", "READY_TO_CLOSE"]);

// 1) POLÍTICAS — a IA respeitou os limites (guardrail, grounding, sem preço inventado)?
export function scorePolicy(v: ConversationView): DimensionResult {
  const ev: EvalEvidence[] = [];
  let hard = 0, soft = 0;
  v.turns.forEach((t, i) => {
    if (t.status === "blocked" || t.decision === "bloqueado") { hard++; ev.push({ turn: i, waMessageId: t.waMessageId, excerpt: excerpt(t.inbound), reason: "resposta bloqueada pelo guardrail" }); }
    if (t.guardrails.some((g) => g.includes("preco_sem_fonte:enforced") || g === "verify:unsupported")) { hard++; ev.push({ turn: i, waMessageId: t.waMessageId, excerpt: excerpt(t.outbound), reason: "afirmação sem fonte (grounding/verify)" }); }
    else if (t.guardrails.some((g) => g.includes("preco_sem_fonte:monitor"))) { soft++; ev.push({ turn: i, waMessageId: t.waMessageId, excerpt: excerpt(t.outbound), reason: "possível preço sem fonte (monitor)" }); }
  });
  const score = clamp01(1 - (hard * 0.4 + soft * 0.1));
  return { score, status: hard ? "violacao" : soft ? "alerta" : "ok", evidence: ev };
}

// 2) TIMING DE VÍDEO — enviado no 1º contato (quando há vídeo configurado)?
export function scoreVideoTiming(v: ConversationView): DimensionResult {
  if (!v.hasVideo) return { score: null, status: "n/a", evidence: [] };
  const sentTurns = v.turns.map((t, i) => (has(t, "enviar_video") ? i : -1)).filter((i) => i >= 0);
  if (!sentTurns.length) {
    if (v.turns.length < 2) return { score: null, status: "n/a-curta", evidence: [] };
    return { score: 0.4, status: "nunca_enviado", evidence: [{ turn: 0, excerpt: "", reason: "vídeo de apresentação nunca foi enviado" }] };
  }
  const first = sentTurns[0];
  let score = first === 0 ? 1 : first <= 2 ? 0.7 : 0.5;
  if (sentTurns.length > 1) score = clamp01(score - 0.2);
  const status = sentTurns.length > 1 ? "repetido" : first === 0 ? "no_1o_contato" : "tardio";
  return { score, status, evidence: sentTurns.map((i) => ({ turn: i, waMessageId: v.turns[i].waMessageId, excerpt: excerpt(v.turns[i].outbound), reason: `vídeo enviado no turno ${i + 1}` })) };
}

// 3) TIMING DE ORÇAMENTO — gerou só com ficha, enviou o PDF, no momento certo?
export function scoreQuoteTiming(v: ConversationView): DimensionResult {
  if (!v.quotesEnabled) return { score: null, status: "n/a", evidence: [] };
  const gerarTurns = v.turns.filter((t) => has(t, "gerar_orcamento"));
  const premature = gerarTurns.filter((t) => t.tools.some((x) => x.name === "gerar_orcamento" && /ainda n[ãa]o posso|colete antes|escolha ao menos/i.test(x.result ?? "")));
  const enviou = v.turns.some((t) => has(t, "enviar_orcamento"));
  const wantedQuote = v.turns.some((t) => (t.intent && QUOTE_INTENT.has(t.intent)) || t.decision === "orcou");
  const ev: EvalEvidence[] = [];
  if (!gerarTurns.length) {
    if (!wantedQuote) return { score: null, status: "n/a", evidence: [] };
    ev.push({ turn: 0, excerpt: "", reason: "lead sinalizou orçamento mas a IA não gerou" });
    return { score: 0.3, status: "nao_gerou", evidence: ev };
  }
  let score = enviou ? 1 : 0.5;
  if (premature.length) { score = clamp01(score - 0.3); ev.push({ turn: 0, excerpt: "", reason: "tentou gerar antes de ter a ficha completa" }); }
  if (!enviou) ev.push({ turn: 0, excerpt: "", reason: "gerou o orçamento mas não enviou o PDF" });
  return { score, status: enviou ? (premature.length ? "gerou_com_tropeço" : "ok") : "gerou_sem_enviar", evidence: ev };
}

// 4) DESCOBERTA — coletou os campos obrigatórios da ficha (quando o orçamento era o rumo)?
export function scoreDiscovery(v: ConversationView): DimensionResult {
  if (!v.quotesEnabled || !v.requiredFields.length) return { score: null, status: "n/a", evidence: [] };
  const attemptedQuote = v.turns.some((t) => has(t, "gerar_orcamento"));
  if (!attemptedQuote && v.turns.length < 4) return { score: null, status: "n/a-curta", evidence: [] }; // saiu cedo, não dá pra cobrar
  const missing = v.requiredFields.filter((f) => { const val = v.ficha[f.key]; return val === undefined || val === "" || val === null; });
  const score = clamp01((v.requiredFields.length - missing.length) / v.requiredFields.length);
  return { score, status: missing.length ? "incompleta" : "completa", evidence: missing.map((f) => ({ turn: 0, excerpt: f.label, reason: `campo obrigatório não coletado: ${f.label}` })) };
}

// 5) OPORTUNIDADE PERDIDA — sinal de compra/visita do lead ficou sem resposta?
export function scoreMissedOpportunity(v: ConversationView): DimensionResult {
  const highs = v.turns.map((t, i) => ({ t, i })).filter(({ t }) => t.intent && HIGH_INTENT.has(t.intent));
  if (!highs.length) return { score: null, status: "n/a", evidence: [] };
  const missed = highs.filter(({ t }) => !t.outbound || t.status === "skipped");
  const score = clamp01((highs.length - missed.length) / highs.length);
  return { score, status: missed.length ? "sinal_ignorado" : "ok", evidence: missed.map(({ t, i }) => ({ turn: i, waMessageId: t.waMessageId, excerpt: excerpt(t.inbound), reason: `sinal forte (${t.intent}) sem resposta da IA` })) };
}

// 6) HANDOFF — escalou pro vendedor quando o lead quis fechar/negociar?
export function scoreHandoff(v: ConversationView): DimensionResult {
  const wantsHuman = v.turns.some((t) => (t.intent && HIGH_INTENT.has(t.intent)) || t.intent === "PRICE_NEGOTIATION") || v.funnelStage === "negociacao";
  const escalated = v.turns.some((t) => t.decision === "escalou" || has(t, "escalar_humano") || has(t, "aprovar_orcamento"));
  if (!wantsHuman && !escalated) return { score: null, status: "n/a", evidence: [] };
  if (wantsHuman && escalated) return { score: 1, status: "ok", evidence: [] };
  if (wantsHuman && !escalated) return { score: 0.4, status: "nao_escalou", evidence: [{ turn: 0, excerpt: "", reason: "lead quis fechar/negociar mas a IA não acionou o vendedor" }] };
  return { score: 0.7, status: "escalou_sem_sinal", evidence: [{ turn: 0, excerpt: "", reason: "escalou sem sinal claro de fechamento" }] };
}

// Pesos default da rubrica (renormalizados sobre as dimensões APLICÁVEIS). Vertical Pack sobrescreve.
const WEIGHTS: Record<string, number> = {
  policy: 0.25, quoteTiming: 0.2, missedOpportunity: 0.2, discovery: 0.15, handoff: 0.15, videoTiming: 0.05,
};

// Agrega as 6 dimensões numa avaliação da conversa (média ponderada sobre as aplicáveis).
export function scoreConversation(v: ConversationView): ConversationEvalResult {
  const dimensions: Record<string, DimensionResult> = {
    policy: scorePolicy(v),
    videoTiming: scoreVideoTiming(v),
    quoteTiming: scoreQuoteTiming(v),
    discovery: scoreDiscovery(v),
    missedOpportunity: scoreMissedOpportunity(v),
    handoff: scoreHandoff(v),
  };
  let wsum = 0, acc = 0;
  for (const [k, d] of Object.entries(dimensions)) {
    if (d.score == null) continue;
    const w = WEIGHTS[k] ?? 0.1;
    wsum += w; acc += w * d.score;
  }
  const overall = wsum > 0 ? clamp01(acc / wsum) : 1;
  // Confiança: determinístico é alto; conversa curta é menos confiável de avaliar.
  const confidence = v.turns.length < 2 ? 0.4 : v.turns.length < 4 ? 0.7 : 0.9;
  return { overall: Math.round(overall * 1000) / 1000, confidence, dimensions, method: "deterministic", rubricVersion: RUBRIC_VERSION };
}
