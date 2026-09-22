// ── Coleta estruturada configurável (F2) ─────────────────────────────────────
// O cliente define QUAIS campos a IA precisa coletar (AiAgentConfig.intakeSpec).
// A IA preenche via a ferramenta atualizar_ficha; aqui ficam os tipos e helpers
// puros (validação, campos faltantes, resumo) — sem I/O, fáceis de testar.

export interface IntakeField {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "boolean" | "option";
  options?: string[]; // para type "option"
}

export type IntakeData = Record<string, string | number | boolean>;

export function parseSpec(spec: unknown): IntakeField[] {
  if (!Array.isArray(spec)) return [];
  return spec.filter((f): f is IntakeField => !!f && typeof (f as IntakeField).key === "string" && typeof (f as IntakeField).label === "string");
}

// Campos obrigatórios ainda não preenchidos — a IA usa para saber o que perguntar.
export function missingRequired(spec: IntakeField[], data: IntakeData): IntakeField[] {
  return spec.filter((f) => f.required && (data[f.key] === undefined || data[f.key] === "" || data[f.key] === null));
}

// ── Nome que não é nome ───────────────────────────────────────────────────────
// O lead responde à saudação com uma saudação, e ela era gravada como o nome
// dele. Caso real (Willian Ribeiro, 21/09/2026): a IA perguntou o nome, ele
// respondeu "Dia" (o fim de "bom dia") e a conversa inteira seguiu com
// "Prazer, Dia!" e "Ótima escolha, Dia!".
//
// Lista FECHADA de propósito: só recusa o que comprovadamente não é nome —
// saudação, confirmação e cortesia. Qualquer outra palavra passa, porque nome
// de gente é imprevisível e recusar um nome legítimo é pior (a IA voltaria a
// perguntar e pareceria surda). "Boa noite" também entra: o lead que escreve
// "noite" está cumprimentando, não se apresentando.
const NAO_E_NOME = new Set([
  "dia", "bom dia", "boa", "tarde", "boa tarde", "noite", "boa noite",
  "oi", "ola", "opa", "eae", "e ai", "alo", "hey", "oi boa tarde", "oi bom dia",
  "sim", "nao", "ok", "okay", "claro", "certo", "beleza", "blz", "isso", "exato",
  "obrigado", "obrigada", "valeu", "vlw", "por favor", "pfv", "tudo bem", "tudo bom",
  "eu", "eu mesmo", "aqui", "nome", "meu nome", "teste",
]);

const chaveNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/** O valor oferecido para o campo `nome` é saudação/cortesia, não um nome? */
export function nomeInvalido(valor: unknown): boolean {
  // Só string pode ser nome. Número e booleano viravam "0"/"false" e o "false"
  // passava o filtro por não estar na lista.
  if (typeof valor !== "string") return true;
  const t = chaveNome(valor);
  if (!t) return true;
  if (NAO_E_NOME.has(t)) return true;
  // Uma letra só ("a", "b") nunca é nome; duas podem ser iniciais, então passam.
  return t.replace(/\s/g, "").length < 2;
}

// Saudações que a IA PODE usar para abrir uma mensagem. Ficam de fora da
// proibição de vocativo: se o lead escreveu "Oi" e passássemos "oi" para
// removerVocativo, um "Oi, tudo bem?" legítimo da IA perderia a abertura.
const SAUDACAO_DE_ABERTURA = new Set(["oi", "ola", "opa", "eae", "e ai", "alo", "hey"]);

/**
 * A mensagem ISOLADA do lead é algo que nunca pode virar vocativo?
 *
 * Usada para varrer a conversa, não só o turno: no replay do Willian o intake
 * recusou "Dia" no turno 2 e a IA escreveu "Dia, temos os três modelos..." no
 * turno 3 — onde não havia mais chamada de atualizar_ficha e, portanto, nenhum
 * aviso. A proibição tem de valer pela conversa inteira.
 */
export function proibidoComoVocativo(mensagemDoLead: string): boolean {
  const t = chaveNome(mensagemDoLead);
  if (!t || t.split(" ").length > 3) return false; // frase não é tentativa de nome
  if (SAUDACAO_DE_ABERTURA.has(t)) return false;
  return NAO_E_NOME.has(t);
}

// Filtra/normaliza o que a IA mandou para as chaves conhecidas do spec (ignora ruído).
export function sanitizeIntake(spec: IntakeField[], incoming: Record<string, unknown>): { data: IntakeData; invalidOptions: string[]; nomeRecusado: string | null } {
  const keys = new Map(spec.map((f) => [f.key, f]));
  const data: IntakeData = {};
  const invalidOptions: string[] = [];
  let nomeRecusado: string | null = null;
  for (const [k, v] of Object.entries(incoming)) {
    const field = keys.get(k);
    if (!field || v === undefined || v === null || v === "") continue;
    // Não grava — e AVISA quem chamou. Descartar em silêncio não bastava: a IA
    // seguia usando o "nome" no texto da resposta, que é justamente onde o erro
    // aparece para o lead ("Prazer, Dia!").
    if (k === "nome" && nomeInvalido(v)) { nomeRecusado = String(v).slice(0, 40); continue; }
    if (field.type === "number") { const n = Number(v); if (!Number.isNaN(n)) data[k] = n; continue; }
    if (field.type === "boolean") { data[k] = v === true || v === "true" || v === "sim"; continue; }
    if (field.type === "option" && field.options && !field.options.includes(String(v))) { invalidOptions.push(`${k}=${v}`); continue; }
    data[k] = typeof v === "boolean" || typeof v === "number" ? v : String(v);
  }
  return { data, invalidOptions, nomeRecusado };
}

export function summarizeIntake(spec: IntakeField[], data: IntakeData): string {
  return spec
    .filter((f) => data[f.key] !== undefined && data[f.key] !== "")
    .map((f) => `${f.label}: ${data[f.key]}`)
    .join("; ");
}
