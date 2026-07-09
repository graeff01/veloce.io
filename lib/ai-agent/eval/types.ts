// ── Contrato do golden dataset (avaliação da IA) ─────────────────────────────
// Um "golden" é um caso de teste versionado no repositório: entrada + contexto +
// comportamento esperado. Fica DESACOPLADO de qualquer execução (best practice),
// então dá pra rerodar os mesmos casos a cada mudança de prompt/modelo e comparar
// — é isso que transforma "achismo" em teste de regressão.

export interface EvalTurn {
  role: "user" | "assistant";
  content: string;
}

// Asserções determinísticas (rodam SEM juiz LLM — baratas, objetivas, sempre).
export interface EvalExpectation {
  // Decisão registrada pelo orquestrador (ex: "escalou", "agendou", "respondeu_duvida").
  decisao?: string | string[];
  // Ferramentas que a IA DEVE ter chamado neste turno.
  usaFerramenta?: string[];
  // Ferramentas que a IA NÃO pode ter chamado.
  naoUsaFerramenta?: string[];
  // Regex (string) que a resposta NÃO pode conter — ex: preço inventado, desconto.
  proibido?: string[];
  // Regex que a resposta DEVE conter.
  obrigatorio?: string[];
  // A resposta não pode ter sido barrada pelo guardrail de saída.
  naoPodeBloquear?: boolean;
  // Critério qualitativo avaliado por um juiz LLM (opcional; só roda com API key).
  rubrica?: string;
}

export interface EvalCase {
  id: string;
  descricao: string;
  vertical?: string; // informativo (o clientId define a config real avaliada)
  historico?: EvalTurn[]; // memória efêmera (transcript) antes da mensagem
  mensagem: string; // última mensagem do lead
  espera: EvalExpectation;
}

export interface CheckResult {
  nome: string;
  passou: boolean;
  detalhe?: string;
}

export interface CaseResult {
  id: string;
  descricao: string;
  passou: boolean;
  reply: string | null;
  decisao: string;
  status: string;
  toolCalls: string[];
  checks: CheckResult[];
  judge?: { passou: boolean; motivo: string } | null;
  erro?: string;
}

export interface EvalReport {
  total: number;
  passaram: number;
  falharam: number;
  casos: CaseResult[];
  clientId: string;
  judgeModel: string | null;
  startedAt: string;
  durationMs: number;
}
