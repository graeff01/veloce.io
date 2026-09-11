import { prisma } from "@/lib/prisma";
import { cookies, headers } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { validatePassword, validEmail } from "@/lib/portal-password";

export const PORTAL_COOKIE = "vp_session";
const SESSION_DAYS = 60;
// Sessão de APARELHO (app iOS): mais curta que a do navegador. O celular é perdido,
// roubado ou fica com quem saiu da empresa; 60 dias de credencial num aparelho é risco
// que o cookie do navegador não tem. Revogável individualmente por `deviceId`.
const DEVICE_SESSION_DAYS = 30;

export const normEmail = (e: string): string => (e || "").trim().toLowerCase();

// Cliente "protegido" = login+senha LIGADO no painel (ClientPortal.requireLogin).
// Desligado = painel aberto pelo link (legado) — nada quebra até a agência ativar.
export async function isProtected(clientId: string): Promise<boolean> {
  const p = await prisma.clientPortal.findUnique({ where: { clientId }, select: { requireLogin: true } });
  return !!p?.requireLogin;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw || "", hash).catch(() => false);
}

export interface AuthResult { ok: boolean; status?: number; error?: string; email?: string }

// Auto-cadastro pelo link fixo (e-mail + senha), limitado por ClientPortal.maxUsers.
// Um e-mail já convidado (linha sem senha) pode definir a senha mesmo no limite.
export async function registerUser(clientId: string, email: string, password: string, name?: string): Promise<AuthResult> {
  const e = normEmail(email);
  if (!validEmail(e)) return { ok: false, status: 400, error: "E-mail inválido." };
  const pol = validatePassword(password);
  if (!pol.ok) return { ok: false, status: 400, error: pol.error };

  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { requireLogin: true, maxUsers: true } });
  if (!portal?.requireLogin) return { ok: false, status: 403, error: "Login não está ativado para este painel." };

  const existing = await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId, email: e } }, select: { passwordHash: true, sections: true } });
  if (existing?.passwordHash) return { ok: false, status: 409, error: "Esse e-mail já tem conta. Faça login." };

  // Teto: conta só quem já é usuário efetivo (tem senha). Convidado sem senha não ocupa vaga extra.
  // A contagem e a criação abaixo não são atômicas entre si — cadastros simultâneos podiam
  // furar o teto. Reservamos uma folga de 0 (checagem estrita) e revalidamos após o upsert.
  if (!existing) {
    const registered = await prisma.portalAccess.count({ where: { clientId, passwordHash: { not: null } } });
    if (registered >= (portal.maxUsers ?? 3)) return { ok: false, status: 403, error: "Este painel atingiu o limite de usuários. Fale com a sua agência." };
  }

  // SEGURANÇA (achado A-02): antes, o PRIMEIRO a usar o link virava ADMIN do painel do
  // cliente — quem obtivesse o link antes da loja assumia o painel (sem convite e sem
  // verificação de e-mail). Agora ninguém se auto-promove: quem já foi CONVIDADO pela
  // agência (linha em PortalAccess criada no painel interno) mantém o papel definido lá;
  // o auto-cadastro nasce sempre como `attendant`, e a agência promove pelo painel.
  // PORTAL_FIRST_USER_ADMIN=1 restaura o comportamento antigo, se for necessário.
  const invited = await prisma.portalAccess.findUnique({
    where: { clientId_email: { clientId, email: e } }, select: { role: true },
  });
  const hasAdmin = (await prisma.portalAccess.count({ where: { clientId, role: "admin", passwordHash: { not: null } } })) > 0;
  const legacyFirstAdmin = process.env.PORTAL_FIRST_USER_ADMIN === "1" && !hasAdmin;
  const role = invited?.role === "admin" || legacyFirstAdmin ? "admin" : "attendant";

  // Vendedor novo nasce só com Conversas (sections=""); admin vê tudo (null).
  // Não mexe em sections já pré-configurado pelo admin antes do cadastro.
  const initSections = role === "attendant" && existing?.sections == null ? "" : undefined;
  const passwordHash = await hashPassword(password);
  await prisma.portalAccess.upsert({
    where: { clientId_email: { clientId, email: e } },
    create: { clientId, email: e, passwordHash, name: name?.trim() || null, role, sections: role === "attendant" ? "" : null },
    update: { passwordHash, ...(name?.trim() ? { name: name.trim() } : {}), ...(role === "admin" ? { role: "admin" } : {}), ...(initSections !== undefined ? { sections: initSections } : {}) },
  });

  // Revalidação pós-escrita (fecha a corrida de cadastros simultâneos): se o teto
  // estourou, desfaz ESTE cadastro — nunca um já existente.
  if (!existing) {
    const registered = await prisma.portalAccess.count({ where: { clientId, passwordHash: { not: null } } });
    if (registered > (portal.maxUsers ?? 3)) {
      await prisma.portalAccess.deleteMany({ where: { clientId, email: e } }).catch(() => {});
      return { ok: false, status: 403, error: "Este painel atingiu o limite de usuários. Fale com a sua agência." };
    }
  }
  return { ok: true, email: e };
}

export async function loginUser(clientId: string, email: string, password: string): Promise<AuthResult> {
  const e = normEmail(email);
  const u = await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId, email: e } }, select: { passwordHash: true } });
  // Mensagem genérica (não revela se o e-mail existe).
  if (!u?.passwordHash || !(await verifyPassword(password, u.passwordHash))) {
    return { ok: false, status: 401, error: "E-mail ou senha incorretos." };
  }
  await prisma.portalAccess.update({ where: { clientId_email: { clientId, email: e } }, data: { lastLoginAt: new Date() } }).catch(() => {});
  return { ok: true, email: e };
}

export interface DeviceInfo { id: string; name?: string | null; platform?: string | null }

const PLATFORMS = new Set(["ios", "android"]);

// Valida o `device` que o app manda no login. PURO (testável sem Next).
// Rejeita silenciosamente qualquer coisa fora do formato → cai na sessão de navegador.
// `id` é gerado pelo próprio app (UUID) e serve só para revogação; nunca é identidade.
export function parseDevice(input: unknown): DeviceInfo | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Record<string, unknown>;
  const id = typeof d.id === "string" ? d.id.trim() : "";
  if (id.length < 8 || id.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(id)) return null;
  const platform = typeof d.platform === "string" ? d.platform.trim().toLowerCase() : "";
  const name = typeof d.name === "string" ? d.name.trim().slice(0, 80) : "";
  return {
    id,
    name: name || null,
    platform: PLATFORMS.has(platform) ? platform : null,
  };
}

// `device` presente = sessão de aparelho (app nativo): TTL menor e revogável sozinha.
// Ausente = comportamento atual do navegador, sem alteração alguma.
export async function createSession(clientId: string, email: string, device?: DeviceInfo | null): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  const days = device ? DEVICE_SESSION_DAYS : SESSION_DAYS;
  await prisma.portalSession.create({
    data: {
      sessionToken: token, clientId, email: normEmail(email),
      expiresAt: new Date(Date.now() + days * 86_400_000),
      ...(device ? { deviceId: device.id, deviceName: device.name ?? null, devicePlatform: device.platform ?? null } : {}),
    },
  });
  return token;
}
export const sessionCookieOptions = () => ({ httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86_400 });

// Server-side: lê o cookie, valida a sessão p/ ESTE cliente, desliza e retorna o e-mail.
// Deslizamento da sessão com histerese: antes, TODA leitura de sessão fazia um UPDATE
// (uma escrita por requisição). Com o gate central passando por aqui em todas as rotas
// do portal, isso viraria escrita em caminho quente — inclusive no polling de conversas.
// Renovar a cada 5 min tem o mesmo efeito prático numa sessão de 60 dias.
const SLIDE_EVERY_MS = 5 * 60_000;

// Extrai o token de sessão de um header Authorization. PURO (testável sem Next).
// Só aceita o esquema Bearer; devolve null para qualquer outra coisa.
export function bearerFromHeader(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(authorization.trim());
  return m ? m[1] : null;
}

// ── Token da sessão: cookie (web/PWA) OU Authorization: Bearer (app nativo) ────
// ADITIVO e retrocompatível: o cookie é tentado PRIMEIRO e seu caminho é idêntico ao
// de antes. O app nativo não tem como guardar um cookie httpOnly, então manda o MESMO
// `sessionToken` no header — resolvendo para a MESMA linha de PortalSession.
//
// Por que aqui e não no guardPortal: esta função é o funil por onde passam os ~35
// pontos de leitura de sessão do portal (o guardPortal inclusive). Estendê-la dá
// suporte mobile a TODAS as rotas — inclusive `send`, `send-media` e `assign`, que
// usam checagem manual — sem editar nenhuma rota e sem a consolidação em massa.
//
// Não amplia a superfície: o Bearer carrega o mesmo segredo opaco que o cookie já
// carrega, e quem o possui já teria acesso pelo cookie. Contra CSRF é ESTRITAMENTE
// melhor (header não é enviado sozinho pelo navegador). O token do portal (capability
// da URL) nunca casa aqui: a busca é por `sessionToken`.
export async function readSessionToken(): Promise<string | null> {
  const fromCookie = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (fromCookie) return fromCookie;
  return bearerFromHeader((await headers()).get("authorization"));
}

export async function getPortalSessionEmail(clientId: string): Promise<string | null> {
  const tok = await readSessionToken();
  if (!tok) return null;
  const s = await prisma.portalSession.findUnique({ where: { sessionToken: tok } });
  if (!s || s.clientId !== clientId || s.expiresAt < new Date()) return null;
  const seen = s.lastSeenAt.getTime();
  if (Date.now() - seen > SLIDE_EVERY_MS) {
    const days = s.deviceId ? DEVICE_SESSION_DAYS : SESSION_DAYS;
    await prisma.portalSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + days * 86_400_000) } }).catch(() => {});
  }
  return s.email;
}

// Usuário logado (e-mail + nome + papel) para ESTE cliente, a partir do cookie.
export async function getPortalUser(clientId: string): Promise<{ email: string; name: string | null; role: string } | null> {
  const email = await getPortalSessionEmail(clientId);
  if (!email) return null;
  const u = await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId, email } }, select: { email: true, name: true, role: true } });
  if (!u) return { email, name: null, role: "attendant" };
  return { email: u.email, name: u.name, role: u.role };
}

export const isAdminRole = (role: string | null | undefined) => role === "admin";

// Encerra a sessão (logout): apaga a linha da sessão ATUAL — cookie no web, Bearer no app.
export async function destroySession(): Promise<void> {
  const tok = await readSessionToken();
  if (tok) await prisma.portalSession.deleteMany({ where: { sessionToken: tok } }).catch(() => {});
}

// Aparelhos com sessão ativa deste usuário (para "sair deste aparelho" no app).
export async function listDeviceSessions(clientId: string, email: string) {
  const rows = await prisma.portalSession.findMany({
    where: { clientId, email: normEmail(email), deviceId: { not: null }, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { deviceId: true, deviceName: true, devicePlatform: true, lastSeenAt: true, createdAt: true },
  });
  return rows;
}

// Revoga UM aparelho sem derrubar as outras sessões (nem a do navegador) — o celular
// perdido some, o resto continua. Escopado por clientId+email: ninguém revoga o de outro.
export async function revokeDeviceSession(clientId: string, email: string, deviceId: string): Promise<number> {
  const r = await prisma.portalSession.deleteMany({ where: { clientId, email: normEmail(email), deviceId } });
  return r.count;
}
