// ── Cliente HTTP do portal ────────────────────────────────────────────────────
// Um único ponto de saída de rede do app. Responsabilidades:
//   • anexar a credencial (Authorization: Bearer) — nunca cookie;
//   • traduzir status em ApiError com intenção de UI;
//   • tratar sessão REVOGADA (401) limpando o Keychain uma única vez;
//   • validar o contrato da resposta;
//   • nunca logar credencial nem conteúdo de conversa.
//
// `fetch` é injetável para que tudo aqui seja testável sem rede e sem simulador.

import { ApiError, apiErrorFrom, offlineError } from "./errors";
import { portalPath } from "./api-base";
import { log } from "./redact";
import {
  parseAdsPerformance, parseConversation, parseConversationList, parseMe, parseQuoteReviews,
  type AdsPerformance, type Conversation, type ConversationList, type Me, type QuoteReview,
} from "./contracts";

export interface StoredSession {
  token: string;
  expiresAt: string | null;
}

/** Guarda da credencial. A implementação real usa Keychain (expo-secure-store). */
export interface SessionStore {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export interface DeviceIdentity {
  id: string;
  name?: string | null;
  platform?: "ios" | "android" | null;
}

export interface ClientOptions {
  baseUrl: string;
  store: SessionStore;
  device: DeviceIdentity;
  fetchImpl?: typeof fetch;
  /** Chamado quando o servidor recusa a credencial: a UI volta para o login. */
  onSessionLost?: () => void;
  /** Tempo máximo por requisição. */
  timeoutMs?: number;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** multipart: quando presente, `body` é ignorado. */
  form?: FormData;
  /** Token explícito (usado só no login, antes de existir sessão gravada). */
  bearer?: string;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class VeloceClient {
  private readonly baseUrl: string;
  private readonly store: SessionStore;
  private readonly device: DeviceIdentity;
  private readonly http: typeof fetch;
  private readonly onSessionLost?: () => void;
  private readonly timeoutMs: number;
  /** Evita disparar N logouts quando várias chamadas paralelas tomam 401 juntas. */
  private sessionLostAnnounced = false;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.store = opts.store;
    this.device = opts.device;
    this.http = opts.fetchImpl ?? globalThis.fetch;
    this.onSessionLost = opts.onSessionLost;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ── núcleo ──────────────────────────────────────────────────────────────────

  private async request(path: string, opts: RequestOptions = {}): Promise<unknown> {
    const bearer = opts.bearer ?? (await this.store.read())?.token ?? null;

    const headers: Record<string, string> = { accept: "application/json" };
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    if (opts.body !== undefined && !opts.form) headers["content-type"] = "application/json";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Um abort externo (usuário saiu da tela) também cancela.
    opts.signal?.addEventListener("abort", () => controller.abort(), { once: true });

    let res: Response;
    try {
      res = await this.http(`${this.baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
        signal: controller.signal,
      });
    } catch {
      // Falha de transporte: rede caiu, DNS, timeout. Nunca logamos a URL crua —
      // ela pode conter o token do portal durante o vínculo.
      log.warn(`falha de rede em ${path}`);
      throw offlineError();
    } finally {
      clearTimeout(timer);
    }

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      const err = apiErrorFrom(res.status, payload, res.headers.get("retry-after"));
      if (err.requiresLogout) await this.handleSessionLost();
      throw err;
    }

    return payload;
  }

  /** Sessão recusada pelo servidor (expirou, deslogou, ou o aparelho foi revogado). */
  private async handleSessionLost(): Promise<void> {
    await this.store.clear().catch(() => {});
    if (this.sessionLostAnnounced) return;
    this.sessionLostAnnounced = true;
    log.info("sessão encerrada pelo servidor; credencial removida do aparelho");
    this.onSessionLost?.();
  }

  // ── vínculo e sessão ────────────────────────────────────────────────────────

  /**
   * Login. O token do portal (`portalToken`) é usado APENAS aqui, para descobrir o
   * tenant, e nunca é gravado. A resposta traz o sessionToken, que vai para o
   * Keychain — daí em diante todas as chamadas usam `_session`.
   */
  async login(portalToken: string, email: string, password: string): Promise<StoredSession> {
    const payload = await this.request(`/api/portal/${portalToken}/auth/login`, {
      method: "POST",
      body: {
        email,
        password,
        device: { id: this.device.id, name: this.device.name ?? null, platform: this.device.platform ?? "ios" },
      },
      bearer: "", // sem credencial anterior
    });

    const d = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const token = typeof d.sessionToken === "string" ? d.sessionToken : "";
    if (!token) {
      // Servidor autenticou mas não devolveu token de aparelho: versão do backend
      // sem suporte a sessão de aparelho. Falha explícita, não silenciosa.
      throw new ApiError("server", 500, "Este servidor ainda não suporta login pelo aplicativo.");
    }

    const session: StoredSession = {
      token,
      expiresAt: typeof d.expiresAt === "string" ? d.expiresAt : null,
    };
    await this.store.write(session);
    this.sessionLostAnnounced = false;
    return session;
  }

  async logout(): Promise<void> {
    // Melhor esforço: se a rede falhar, a credencial local some do mesmo jeito.
    await this.request(portalPath("/auth/logout"), { method: "POST" }).catch(() => {});
    await this.store.clear();
  }

  async me(): Promise<Me> {
    return parseMe(await this.request(portalPath("/me")));
  }

  /** Contadores da barra inferior (aguardando resposta / orçamentos a revisar). */
  async badges(): Promise<{ waiting: number; reviews: number }> {
    const d = await this.request(portalPath("/badges"));
    const o = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    return { waiting: n(o.waiting), reviews: n(o.reviews) };
  }

  // ── conversas ───────────────────────────────────────────────────────────────

  async conversations(params: {
    limit?: number; offset?: number; q?: string; onlyMine?: boolean; signal?: AbortSignal;
  } = {}): Promise<ConversationList> {
    const sp = new URLSearchParams();
    sp.set("limit", String(params.limit ?? 30));
    sp.set("offset", String(params.offset ?? 0));
    if (params.q?.trim()) sp.set("q", params.q.trim());
    if (params.onlyMine) sp.set("owner", "me");
    return parseConversationList(
      await this.request(`${portalPath("/conversations")}?${sp.toString()}`, { signal: params.signal }),
    );
  }

  async conversation(contactId: string, signal?: AbortSignal): Promise<Conversation> {
    return parseConversation(await this.request(portalPath(`/conversations/${contactId}`), { signal }));
  }

  async sendText(contactId: string, text: string): Promise<void> {
    await this.request(portalPath(`/conversations/${contactId}/send`), { method: "POST", body: { text } });
  }

  async sendMedia(contactId: string, form: FormData): Promise<void> {
    await this.request(portalPath(`/conversations/${contactId}/send-media`), { method: "POST", form });
  }

  async assign(contactId: string, email: string | null): Promise<void> {
    await this.request(portalPath(`/conversations/${contactId}/assign`), { method: "POST", body: { email } });
  }

  /** URL do stream de uma conversa (SSE). Consumida por src/ui/stream.ts. */
  streamPath(contactId: string): string {
    return `${this.baseUrl}${portalPath(`/conversations/${contactId}/stream`)}`;
  }

  async addTag(contactId: string, tagId: string): Promise<void> {
    await this.request(portalPath(`/conversations/${contactId}/tags`), { method: "POST", body: { tagId } });
  }

  /**
   * URL de uma mídia recebida. Precisa de credencial no header, então NÃO serve
   * para <Image source={{uri}}> direto — quem consome usa `authorizedImageSource`.
   */
  mediaPath(contactId: string, messageId: string): string {
    return `${this.baseUrl}${portalPath(`/conversations/${contactId}/media/${messageId}`)}`;
  }

  /** Header de autenticação para componentes que baixam binário (imagem, PDF, áudio). */
  async authHeaders(): Promise<Record<string, string>> {
    const s = await this.store.read();
    return s?.token ? { Authorization: `Bearer ${s.token}` } : {};
  }

  // ── anúncios (desempenho de mídia) ──────────────────────────────────────────

  async adsPerformance(periodo = "month"): Promise<AdsPerformance> {
    return parseAdsPerformance(await this.request(`${portalPath("/ads")}?p=${encodeURIComponent(periodo)}`));
  }

  // ── orçamentos ──────────────────────────────────────────────────────────────

  async quoteReviews(): Promise<QuoteReview[]> {
    return parseQuoteReviews(await this.request(portalPath("/quote-reviews")));
  }

  async approveQuote(quoteId: string): Promise<void> {
    await this.request(portalPath(`/quote-reviews/${quoteId}/approve`), { method: "POST" });
  }

  async rejectQuote(quoteId: string, reason?: string): Promise<void> {
    await this.request(portalPath(`/quote-reviews/${quoteId}/reject`), {
      method: "POST",
      body: reason ? { reason } : {},
    });
  }

  quotePdfPath(quoteId: string): string {
    return `${this.baseUrl}${portalPath(`/quote-reviews/${quoteId}/pdf`)}`;
  }

  // ── push ────────────────────────────────────────────────────────────────────

  async registerPushToken(token: string): Promise<void> {
    await this.request(portalPath("/push/subscribe"), {
      method: "POST",
      body: { apnsToken: token, deviceId: this.device.id, platform: this.device.platform ?? "ios" },
    });
  }
}
