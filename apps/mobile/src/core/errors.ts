// ── Erros da API do portal, com significado de produto ────────────────────────
// O backend já responde com códigos e mensagens em português pensadas para o
// atendente. O app NÃO reescreve regra: traduz status em intenção de UI (repetir?
// deslogar? avisar e parar?) e reaproveita a mensagem do servidor quando existe.

export type ApiErrorKind =
  | "unauthorized"    // 401 — sessão ausente, expirada ou REVOGADA → deslogar
  | "forbidden"       // 403 — sem permissão/seção → não adianta repetir
  | "not_found"       // 404 — recurso fora do tenant, ou link inválido
  | "rate_limited"    // 429 — respeitar Retry-After
  | "conflict"        // 409
  | "invalid"         // 400/422 — entrada ruim
  | "server"          // 5xx — repetível
  | "offline"         // sem rede
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(kind: ApiErrorKind, status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  /** Sessão morreu no servidor: o app tem de limpar o Keychain e voltar ao login. */
  get requiresLogout(): boolean {
    return this.kind === "unauthorized";
  }

  /** Vale tentar de novo sozinho? 403/404/400 não valem — repetir só irrita o servidor. */
  get isRetryable(): boolean {
    return this.kind === "server" || this.kind === "offline" || this.kind === "rate_limited";
  }
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "invalid";
  if (status >= 500) return "server";
  return "unknown";
}

const FALLBACK: Record<ApiErrorKind, string> = {
  unauthorized: "Sua sessão expirou. Entre novamente.",
  forbidden: "Você não tem acesso a esta área.",
  not_found: "Não encontrado.",
  rate_limited: "Muitas requisições. Aguarde um instante.",
  conflict: "Esse registro já existe.",
  invalid: "Dados inválidos.",
  server: "O servidor teve um problema. Tente de novo.",
  offline: "Sem conexão. Verifique a internet.",
  unknown: "Não foi possível concluir.",
};

/** Header Retry-After (segundos) → milissegundos. Tolerante a lixo. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds, 3600) * 1000;
}

/**
 * Constrói o erro a partir da resposta. Prefere a mensagem do servidor (que é
 * escrita para o atendente, em português) e cai no texto genérico se não houver.
 */
export function apiErrorFrom(status: number, body: unknown, retryAfter: string | null = null): ApiError {
  const kind = kindForStatus(status);
  const fromServer =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? ((body as { error: string }).error || "").trim()
      : "";
  return new ApiError(kind, status, fromServer || FALLBACK[kind], parseRetryAfter(retryAfter));
}

export const offlineError = (): ApiError => new ApiError("offline", 0, FALLBACK.offline);

/**
 * Requisição cancelada pela própria UI (troca de filtro, nova busca, saída da
 * tela). Reaproveita o tipo "offline" para não alargar a superfície de erro —
 * o que importa é NÃO ser tratado nem registrado como falha.
 */
export const canceladoError = (): ApiError => new ApiError("offline", 0, "cancelado");
