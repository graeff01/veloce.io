// ── Prompt Compiler — TIPOS ──────────────────────────────────────────────────────
// O prompt final deixa de ser um blob editado à mão e passa a ser um ARTEFATO COMPILADO
// a partir de fontes estruturadas (ver docs/rfc-prompt-compiler.md §4). Cada conceito tem
// UM lar canônico; números vêm da config (zero drift); o compilador dedupe, ordena e faz o
// lint que FALHA o build. Este arquivo só descreve o formato das fontes e do relatório.

// Tópicos na ordem em que aparecem no prompt final (fluxo de atendimento).
export const TOPIC_ORDER = [
  "identidade",   // quem é a IA, tom, nome
  "abertura",     // saudação, primeiro contato, coleta de nome
  "conducao",     // condução da conversa, uma pergunta por vez, gatear por modelo
  "orcamento",    // preço, frete, montagem, desconto, pagamento
  "midia",        // política de foto/vídeo
  "blindagem",    // anti-alucinação, quando escalar, o que nunca fazer
] as const;
export type PolicyTopic = (typeof TOPIC_ORDER)[number];

// Um módulo de política = UMA regra comportamental, escrita uma única vez.
export interface PolicyModule {
  id: string;                 // único, kebab-case (ex.: "uma-pergunta-por-vez")
  topic: PolicyTopic;         // onde mora no prompt
  priority?: number;          // ordena DENTRO do tópico (menor primeiro; default 100)
  text: string;               // pode conter placeholders {{param}} — NUNCA número literal de config
  examples?: string[];        // frases-modelo desta regra (banco curado, 1 lar por exemplo)
  intent?: string;            // "assunto canônico" — 2+ módulos com o mesmo intent = duplicata (a menos que reforço)
  reforco?: boolean;          // repetição DELIBERADA (blindagem repete de propósito) — o lint mantém
  conflitaCom?: string[];     // ids de módulos que se contradizem com este
  desempate?: string;         // regra de fronteira que resolve o conflito (obrigatória se houver conflitaCom)
}

// Parâmetros de negócio resolvidos em tempo de compilação (fonte: pricingConfig/agentConfig).
export type CompileParams = Record<string, string | number | null | undefined>;

export interface CompileInput {
  identity?: string;          // cabeçalho fixo (opcional; pode ser o 1º módulo "identidade")
  modules: PolicyModule[];
  params?: CompileParams;     // valores para os {{placeholders}}
  knowledge?: string[];       // ponteiros de conhecimento ("consulte o Conhecimento quando…")
}

export type LintKind =
  | "duplicate"          // dois módulos com o mesmo intent sem reforço
  | "drift"              // número de config escrito à mão no texto (deveria ser {{placeholder}})
  | "orphan-ref"         // "ver seção X" sem alvo
  | "conflict"           // conflitaCom sem desempate declarado
  | "orphan-example"     // "ex.:" inline no texto (deveria estar em examples[])
  | "unresolved-param";  // {{placeholder}} sem valor na config

export interface LintIssue {
  kind: LintKind;
  severity: "error" | "warn"; // error FALHA o build
  message: string;
  moduleId?: string;
}

export interface ModuleStat {
  id: string;
  topic: PolicyTopic;
  chars: number;
  approxTokens: number;
}

export interface CompileReport {
  chars: number;
  approxTokens: number;
  perModule: ModuleStat[];
  issues: LintIssue[];
  ok: boolean;                // true = nenhum issue com severity "error"
}

export interface CompiledPrompt {
  prompt: string;
  report: CompileReport;
}
