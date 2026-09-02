// ── Transporte APNs (app iOS do Portal do Cliente) ────────────────────────────
// Irmão de web-push.ts, não substituto: o PWA continua no VAPID. Aqui só entra o
// COMO notificar um aparelho; o QUANDO segue em portal-push.ts, intocado.
//
// Sem dependência nova: JWT ES256 com `crypto` do Node e envio por HTTP/2 nativo.
//
// ESTADO: a assinatura do JWT é testada (tests/apns-jwt.test.ts gera um par EC e
// verifica). O ENVIO em si nunca foi exercitado contra a Apple — depende de conta
// Apple Developer e de um aparelho real. Enquanto `APNS_*` não estiver configurado,
// `sendApns` é no-op silencioso: nenhum caminho de produção muda.

import { createSign, createPrivateKey, type KeyObject } from "crypto";
import { connect, constants } from "http2";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKeyPem: string;
}

export interface ApnsPayload {
  title: string;
  body: string;
  /** Rota interna do app (deep link), ex.: "conversas/abc123". */
  route?: string;
  /** Contador do ícone. */
  badge?: number;
  /** Agrupa notificações da mesma conversa. */
  collapseId?: string;
}

const HOST_PROD = "https://api.push.apple.com";
const HOST_SANDBOX = "https://api.sandbox.push.apple.com";

/** Config vinda do ambiente. Ausente = push mobile desligado (e é o padrão hoje). */
export function apnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  // A chave .p8 chega como PEM; `\n` escapado é comum em painel de variáveis.
  const privateKeyPem = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !bundleId || !privateKeyPem) return null;
  return { keyId, teamId, bundleId, privateKeyPem };
}

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64url");

/**
 * A assinatura ECDSA do Node sai em DER; JOSE (ES256) exige r||s de 32 bytes cada.
 * Converter errado gera um JWT que a Apple rejeita com 403 sem explicar.
 */
export function derToJose(der: Buffer): Buffer {
  if (der[0] !== 0x30) throw new Error("assinatura DER inválida");
  let offset = der[1]! & 0x80 ? 2 + (der[1]! & 0x7f) : 2;

  const readInt = (): Buffer => {
    if (der[offset] !== 0x02) throw new Error("assinatura DER inválida");
    const len = der[offset + 1]!;
    let start = offset + 2;
    let size = len;
    // Remove o byte 0x00 de sinal e preenche à esquerda até 32 bytes.
    while (size > 0 && der[start] === 0x00) { start++; size--; }
    if (size > 32) throw new Error("componente maior que 32 bytes");
    offset = offset + 2 + len;
    return Buffer.concat([Buffer.alloc(32 - size, 0), der.subarray(start, start + size)]);
  };

  return Buffer.concat([readInt(), readInt()]);
}

/** JWT de autenticação do provedor. A Apple aceita reuso por até 1h. */
export function buildApnsJwt(cfg: { keyId: string; teamId: string }, key: KeyObject, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const signing = `${header}.${claims}`;
  const der = createSign("SHA256").update(signing).sign(key);
  return `${signing}.${b64url(derToJose(der))}`;
}

/** Corpo APNs (`aps`) + dados do app. Puro e testável. */
export function buildApnsBody(payload: ApnsPayload): Record<string, unknown> {
  return {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      ...(payload.badge === undefined ? {} : { badge: payload.badge }),
      "thread-id": payload.collapseId,
    },
    // Consumido pelo app para abrir a tela certa (ver src/ui/push.ts).
    route: payload.route ?? "conversas",
  };
}

let cachedKey: KeyObject | null = null;
let cachedJwt: { token: string; at: number } | null = null;

function providerJwt(cfg: ApnsConfig): string {
  const ageMs = cachedJwt ? Date.now() - cachedJwt.at : Infinity;
  if (cachedJwt && ageMs < 45 * 60_000) return cachedJwt.token; // < 1h, com folga
  cachedKey ??= createPrivateKey(cfg.privateKeyPem);
  const token = buildApnsJwt(cfg, cachedKey);
  cachedJwt = { token, at: Date.now() };
  return token;
}

export interface ApnsResult {
  ok: boolean;
  status: number;
  /** "Unregistered"/"BadDeviceToken" → apagar o aparelho da base. */
  reason?: string;
}

/**
 * Envia para UM aparelho. Devolve o status para o chamador decidir se remove o
 * token. Nunca lança: falha de push não pode derrubar o fluxo que a originou.
 */
export async function sendApns(
  deviceToken: string,
  payload: ApnsPayload,
  environment: "production" | "sandbox" = "production",
): Promise<ApnsResult> {
  const cfg = apnsConfig();
  if (!cfg) return { ok: false, status: 0, reason: "APNS não configurado" };

  const host = environment === "sandbox" ? HOST_SANDBOX : HOST_PROD;

  return new Promise<ApnsResult>((resolve) => {
    let done = false;
    const finish = (r: ApnsResult) => { if (!done) { done = true; resolve(r); } };

    let session: ReturnType<typeof connect>;
    try {
      session = connect(host);
    } catch {
      finish({ ok: false, status: 0, reason: "falha ao conectar" });
      return;
    }
    session.on("error", () => finish({ ok: false, status: 0, reason: "erro de sessão" }));

    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
      authorization: `bearer ${providerJwt(cfg)}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(payload.collapseId ? { "apns-collapse-id": payload.collapseId.slice(0, 64) } : {}),
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0); });
    req.on("data", (c) => { body += c; });
    req.on("error", () => { session.close(); finish({ ok: false, status: 0, reason: "erro de requisição" }); });
    req.on("end", () => {
      session.close();
      let reason: string | undefined;
      try { reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined; } catch { /* corpo vazio no sucesso */ }
      finish({ ok: status === 200, status, reason });
    });

    req.end(JSON.stringify(buildApnsBody(payload)));
  });
}

/** Motivos que significam "esse aparelho não existe mais" — remover da base. */
export function isDeadToken(reason: string | undefined, status: number): boolean {
  if (status === 410) return true;
  return reason === "Unregistered" || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic";
}
