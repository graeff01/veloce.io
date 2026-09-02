// ── Redaction de log do app ───────────────────────────────────────────────────
// O app lida com dados pessoais de TERCEIROS (o lead, que nem é usuário do app) e
// com uma credencial de 30 dias. Nada disso pode chegar a um log ou a um relatório
// de crash. Estas funções são a única porta de saída de texto para log.

/** Marca visível no lugar do que foi removido. */
const CUT = "[redigido]";

/**
 * Telefone brasileiro em E.164 sem "+" (o formato do WaContact.waId), ou digitado.
 * Preserva os 4 últimos dígitos: o suficiente para o atendente reconhecer, longe
 * de identificar a pessoa em um log.
 */
export function redactPhone(input: string): string {
  return input.replace(/\b(\d{2})?\d{6,11}(\d{4})\b/g, (_m, _ddi, tail) => `••••${tail}`);
}

/** E-mail: mantém o domínio (útil para diagnóstico), esconde a pessoa. */
export function redactEmail(input: string): string {
  return input.replace(/\b[\w.+-]+@([\w-]+\.[\w.-]+)\b/g, (_m, domain) => `••••@${domain}`);
}

/**
 * Segredos: token de sessão (Bearer), token do portal e qualquer coisa que pareça
 * credencial. Nunca parcial — segredo cortado pela metade ainda é vazamento.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/\bBearer[ \t]+\S+/gi, `Bearer ${CUT}`)
    .replace(/"?(sessionToken|token|password|passwordHash|authorization|apiKey)"?\s*[:=]\s*"?[^",\s}]+"?/gi,
      (_m, key) => `${key}: ${CUT}`)
    .replace(/\/api\/portal\/(?!_session\b)[A-Za-z0-9_-]{16,}/g, "/api/portal/[token]")
    .replace(/\/r\/[A-Za-z0-9_-]{16,}/g, "/r/[token]");
}

/**
 * Conteúdo de conversa: NUNCA vai para log, nem truncado. Um trecho de mensagem de
 * lead num relatório de crash é dado pessoal exportado para terceiro.
 */
export function redactMessageBody(text: string | null | undefined): string {
  if (text == null) return "(vazio)";
  return `(${text.length} caracteres omitidos)`;
}

/** Passe final aplicado a tudo que for logado. */
export function safeForLog(input: unknown): string {
  const raw = typeof input === "string" ? input : safeStringify(input);
  return redactPhone(redactEmail(redactSecrets(raw)));
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[circular]";
        seen.add(v as object);
      }
      return v;
    }) ?? String(value);
  } catch {
    return "[não serializável]";
  }
}

/** Logger do app: única forma autorizada de imprimir. */
export const log = {
  info: (msg: string, ctx?: unknown) =>
    console.log(`[veloce] ${safeForLog(msg)}${ctx === undefined ? "" : ` ${safeForLog(ctx)}`}`),
  warn: (msg: string, ctx?: unknown) =>
    console.warn(`[veloce] ${safeForLog(msg)}${ctx === undefined ? "" : ` ${safeForLog(ctx)}`}`),
  error: (msg: string, ctx?: unknown) =>
    console.error(`[veloce] ${safeForLog(msg)}${ctx === undefined ? "" : ` ${safeForLog(ctx)}`}`),
};
