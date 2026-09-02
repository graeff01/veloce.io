// ── Resolução do endereço da API ──────────────────────────────────────────────
// Regra do projeto: NUNCA embutir a URL de produção no binário, e nunca deixar o
// desenvolvimento apontar para produção por acidente. A URL vem SEMPRE de fora
// (EXPO_PUBLIC_API_URL / app.json → extra.apiUrl) e passa por esta função.
//
// Função PURA: recebe o que o ambiente disse e devolve a base ou um erro claro.

export type AppEnv = "development" | "staging" | "production";

export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigError";
  }
}

/** Hosts que caracterizam infraestrutura real — proibidos fora de `production`. */
const PROD_HOST_MARKERS = [".railway.app", "veloce.io", "veloceio"];

const isLoopback = (host: string): boolean =>
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "::1" ||
  host.endsWith(".local") ||
  // Faixas privadas: celular físico falando com o Mac na mesma rede.
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(host);

/**
 * Valida e normaliza a base da API.
 *
 * - `production` exige HTTPS.
 * - `development`/`staging` REJEITAM hosts de produção — é a trava que impede o
 *   desenvolvimento de falar com o Railway real sem alguém perceber.
 * - Barra final é removida para a concatenação de caminhos ficar previsível.
 */
export function resolveApiBase(raw: string | undefined | null, env: AppEnv): string {
  const value = (raw ?? "").trim();
  if (!value) {
    throw new ApiConfigError(
      `API não configurada para o ambiente "${env}". Defina EXPO_PUBLIC_API_URL — nunca há URL padrão embutida.`,
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiConfigError(`API inválida: "${value}" não é uma URL absoluta.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiConfigError(`Protocolo não suportado: ${url.protocol}`);
  }

  const host = url.hostname.toLowerCase();

  if (env === "production") {
    if (url.protocol !== "https:") {
      throw new ApiConfigError("Produção exige HTTPS.");
    }
  } else {
    const looksProd = PROD_HOST_MARKERS.some((m) => host.includes(m));
    if (looksProd) {
      throw new ApiConfigError(
        `Ambiente "${env}" apontando para infraestrutura de produção (${host}). Bloqueado por segurança.`,
      );
    }
    if (url.protocol === "http:" && !isLoopback(host)) {
      throw new ApiConfigError(`HTTP sem TLS só é permitido em host local; "${host}" não é.`);
    }
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Sentinela de tenant resolvido pela sessão — espelha SESSION_SCOPED do backend. */
export const SESSION_SCOPED = "_session";

/** Monta o caminho de uma rota do portal já escopada pela sessão. */
export function portalPath(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/api/portal/${SESSION_SCOPED}${clean}`;
}
