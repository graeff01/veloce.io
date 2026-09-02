// ── Vínculo do aparelho ao tenant ─────────────────────────────────────────────
// O e-mail NÃO identifica o cliente: PortalAccess é @@unique([clientId, email]),
// então a mesma pessoa pode existir em duas lojas. O tenant vem do link do portal
// que a agência/loja já envia hoje ("/r/<token>").
//
// O token do portal é CREDENCIAL SENSÍVEL. Ele é usado UMA vez, para o login que
// cria a PortalSession, e depois é descartado — o app passa a viver da sessão
// (ver SESSION_SCOPED). Nunca é persistido, nunca é logado.

export class InviteLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteLinkError";
  }
}

export interface PortalInvite {
  /** Origem do backend embutida no link — o app não precisa perguntar a URL. */
  baseUrl: string;
  /** Token do portal. Efêmero: só vive em memória até o login terminar. */
  token: string;
}

/** Tokens do portal são `crypto.randomBytes(18).toString("base64url")` → 24 chars. */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Aceita o link do painel em qualquer das formas que a loja recebe:
 *   https://host/r/<token>
 *   https://host/r/<token>/conversas
 *   veloce://vincular?url=https://host/r/<token>
 */
export function parseInviteLink(input: string): PortalInvite {
  const raw = (input ?? "").trim();
  if (!raw) throw new InviteLinkError("Cole o link do seu painel.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InviteLinkError("Esse texto não é um link válido.");
  }

  // Deep link do próprio app carregando o link real dentro.
  if (url.protocol === "veloce:") {
    const inner = url.searchParams.get("url");
    if (!inner) throw new InviteLinkError("Link de vínculo incompleto.");
    return parseInviteLink(inner);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InviteLinkError("Link precisa ser http(s).");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.indexOf("r");
  const token = at === -1 ? undefined : parts[at + 1];
  if (!token) {
    throw new InviteLinkError("Esse link não é de um painel Veloce.");
  }

  if (!TOKEN_RE.test(token)) {
    throw new InviteLinkError("O link do painel parece incompleto.");
  }

  return { baseUrl: url.origin, token };
}

/**
 * Descrição do link segura para exibir/logar: mostra o host, nunca o token.
 * Usada nas telas de erro do vínculo.
 */
export function describeInvite(invite: PortalInvite): string {
  try {
    return new URL(invite.baseUrl).host;
  } catch {
    return "servidor desconhecido";
  }
}
