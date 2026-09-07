// ── Cliente HTTP do portal ────────────────────────────────────────────────────
// Um único ponto de saída de rede do app. Responsabilidades:
//   • anexar a credencial (Authorization: Bearer) — nunca cookie;
//   • traduzir status em ApiError com intenção de UI;
//   • tratar sessão REVOGADA (401) limpando o Keychain uma única vez;
//   • validar o contrato da resposta;
//   • nunca logar credencial nem conteúdo de conversa.
//
// `fetch` é injetável para que tudo aqui seja testável sem rede e sem simulador.

import { ApiError, apiErrorFrom, canceladoError, offlineError } from "./errors";
import { portalPath } from "./api-base";
import { log } from "./redact";
import {
  parseAdsPerformance, parseCatalogo, parseConversation, parseConversationList, parseEquipe, parseFechamento, parseMe, parseQuoteReviews, parseTags,
  type AdsPerformance, type Conversation, type ConversationList, type Equipe, type Fechamento, type ItemCatalogo, type Me, type QuoteReview, type Tag,
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
  /** Sobrepõe o tempo máximo — subir arquivo não cabe no limite de uma leitura. */
  timeoutMs?: number;
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

  /** Base em uso — só para montar links públicos (documentos legais). */
  get base(): string { return this.baseUrl; }
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
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);
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
    } catch (e) {
      // Cancelamento NÃO é falha. A caixa de entrada aborta a busca anterior a
      // cada troca de filtro ou de texto — o normal é que isso aconteça várias
      // vezes por sessão. Registrar como "falha de rede" enchia o log de alarme
      // falso e escondia problema de verdade.
      if (opts.signal?.aborted) throw canceladoError();
      // Falha de transporte real: rede caiu, DNS, tempo esgotado. Nunca logamos
      // a URL crua — ela pode conter o token do portal durante o vínculo.
      //
      // O MOTIVO vai junto: "falha de rede" sozinho não distingue rede caída de
      // arquivo ilegível, e nos custou várias tentativas às cegas.
      const motivo = e instanceof Error ? e.message : String(e);
      log.warn(`falha de rede em ${path} — ${motivo}`);
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
  /**
   * Marca do cliente ANTES do login. A rota `/me` responde só com o token — sem
   * sessão ela devolve `user: null` e a identidade visual. É o que permite o
   * formulário se vestir do cliente, como o portal web faz.
   *
   * Falhar aqui não impede entrar: é enfeite, não autorização.
   */
  async marcaPublica(portalToken: string): Promise<Me | null> {
    try {
      return parseMe(await this.request(`/api/portal/${portalToken}/me`, { bearer: "" }));
    } catch {
      return null;
    }
  }

  /** Cria o acesso e já entra — mesma rota que o botão "Criar conta" do portal. */
  async registrar(portalToken: string, email: string, password: string, nome: string): Promise<StoredSession> {
    return this.autenticar(`/api/portal/${portalToken}/auth/register`, { email, password, name: nome.trim() || null });
  }

  async login(portalToken: string, email: string, password: string): Promise<StoredSession> {
    return this.autenticar(`/api/portal/${portalToken}/auth/login`, { email, password });
  }

  /** Tronco comum de login e registro. */
  private async autenticar(rota: string, corpo: Record<string, unknown>): Promise<StoredSession> {
    const payload = await this.request(rota, {
      method: "POST",
      body: {
        ...corpo,
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
    limit?: number; offset?: number; q?: string; onlyMine?: boolean;
    /** Mostra o que foi tirado da caixa, em vez do que está nela. */
    arquivadas?: boolean;
    signal?: AbortSignal;
  } = {}): Promise<ConversationList> {
    const sp = new URLSearchParams();
    sp.set("limit", String(params.limit ?? 30));
    sp.set("offset", String(params.offset ?? 0));
    if (params.q?.trim()) sp.set("q", params.q.trim());
    if (params.onlyMine) sp.set("owner", "me");
    if (params.arquivadas) sp.set("arquivadas", "1");
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
    // Subir foto ou áudio numa rede de rua não cabe nos 20s de uma leitura: o
    // aparelho manda o arquivo E o servidor ainda repassa à Meta. Abortar no
    // meio aparecia como "falha de rede" sem que nada estivesse errado.
    await this.request(portalPath(`/conversations/${contactId}/send-media`), {
      method: "POST", form, timeoutMs: 90_000,
    });
  }

  /**
   * Estado compartilhado da conversa. Marcar como lida vale para a EQUIPE —
   * a caixa é de um número só, atendido por várias pessoas.
   */
  async marcarEstado(contactId: string, estado: { lida?: boolean; arquivada?: boolean }): Promise<void> {
    await this.request(portalPath(`/conversations/${contactId}/state`), { method: "POST", body: estado });
  }

  /** Fila de fechamento: quem já aprovou o orçamento e quer comprar. */
  async fechamento(): Promise<Fechamento> {
    return parseFechamento(await this.request(portalPath("/hot-leads")));
  }

  /**
   * "Pegar" o lead: vira dono de forma atômica e silencia a IA. Devolve quem
   * pegou primeiro quando outra pessoa chegou antes — dizer isso é melhor do
   * que um erro genérico com três vendedoras na mesma fila.
   */
  async pegarLead(contactId: string): Promise<{ ok: boolean; takenBy: string | null }> {
    try {
      const r = await this.request(portalPath(`/hot-leads/${contactId}/claim`), { method: "POST" }) as { ok?: unknown };
      return { ok: r?.ok === true, takenBy: null };
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) return { ok: false, takenBy: e.message || null };
      throw e;
    }
  }

  /** Números por atendente. O servidor decide o que este papel pode ver. */
  async equipe(periodo?: string): Promise<Equipe> {
    const cauda = periodo ? `?p=${encodeURIComponent(periodo)}` : "";
    return parseEquipe(await this.request(`${portalPath("/team-metrics")}${cauda}`));
  }

  /** Catálogo do cliente, para consulta no meio do atendimento. */
  async catalogo(q?: string): Promise<ItemCatalogo[]> {
    const sp = new URLSearchParams();
    if (q?.trim()) sp.set("q", q.trim());
    const cauda = sp.toString() ? `?${sp.toString()}` : "";
    return parseCatalogo(await this.request(`${portalPath("/catalog")}${cauda}`));
  }

  /**
   * Assume VÁRIAS conversas de uma vez. O servidor ignora em silêncio as que já
   * têm outra dona e devolve a contagem — é o que a tela usa para dizer a
   * verdade em vez de "pronto".
   */
  async assumirVarias(contactIds: string[]): Promise<{ assumidas: number; ignoradas: number }> {
    const r = await this.request(portalPath("/conversations/bulk-assign"), {
      method: "POST", body: { contactIds },
    }) as { assumidas?: unknown; ignoradas?: unknown };
    return {
      assumidas: Number(r?.assumidas) || 0,
      ignoradas: Number(r?.ignoradas) || 0,
    };
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

  async removeTag(contactId: string, tagId: string): Promise<void> {
    await this.request(portalPath(`/conversations/${contactId}/tags?tagId=${encodeURIComponent(tagId)}`), {
      method: "DELETE",
    });
  }

  /** Etiquetas do cliente (para o menu de aplicar). */
  async tags(): Promise<Tag[]> {
    return parseTags(await this.request(portalPath("/tags")));
  }

  async criarTag(name: string, color: string): Promise<Tag | null> {
    const d = await this.request(portalPath("/tags"), { method: "POST", body: { name, color } });
    const t = d && typeof d === "object" ? (d as Record<string, unknown>) : null;
    return t && typeof t.id === "string" && typeof t.name === "string"
      ? { id: t.id, name: t.name, color: typeof t.color === "string" ? t.color : "#64748B" }
      : null;
  }

  /** Move a etapa do funil. As etapas válidas são as do servidor. */
  async setFunnelStage(contactId: string, stage: string): Promise<void> {
    await this.request(portalPath(`/funnel/${contactId}`), { method: "POST", body: { stage } });
  }

  /** Pede à IA que redija e ENVIE a próxima resposta ao lead. Gasta modelo. */
  async aiReply(contactId: string): Promise<string | null> {
    const d = await this.request(portalPath(`/conversations/${contactId}/ai-reply`), { method: "POST" });
    const o = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
    return typeof o.reply === "string" ? o.reply : null;
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
