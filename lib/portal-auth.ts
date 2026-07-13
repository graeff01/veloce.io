import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { validatePassword, validEmail } from "@/lib/portal-password";

export const PORTAL_COOKIE = "vp_session";
const SESSION_DAYS = 60;

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

  const existing = await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId, email: e } }, select: { passwordHash: true } });
  if (existing?.passwordHash) return { ok: false, status: 409, error: "Esse e-mail já tem conta. Faça login." };

  // Teto: conta só quem já é usuário efetivo (tem senha). Convidado sem senha não ocupa vaga extra.
  if (!existing) {
    const registered = await prisma.portalAccess.count({ where: { clientId, passwordHash: { not: null } } });
    if (registered >= (portal.maxUsers ?? 3)) return { ok: false, status: 403, error: "Este painel atingiu o limite de usuários. Fale com a sua agência." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.portalAccess.upsert({
    where: { clientId_email: { clientId, email: e } },
    create: { clientId, email: e, passwordHash, name: name?.trim() || null },
    update: { passwordHash, ...(name?.trim() ? { name: name.trim() } : {}) },
  });
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

export async function createSession(clientId: string, email: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.portalSession.create({ data: { sessionToken: token, clientId, email: normEmail(email), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } });
  return token;
}
export const sessionCookieOptions = () => ({ httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86_400 });

// Server-side: lê o cookie, valida a sessão p/ ESTE cliente, desliza e retorna o e-mail.
export async function getPortalSessionEmail(clientId: string): Promise<string | null> {
  const tok = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!tok) return null;
  const s = await prisma.portalSession.findUnique({ where: { sessionToken: tok } });
  if (!s || s.clientId !== clientId || s.expiresAt < new Date()) return null;
  await prisma.portalSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } }).catch(() => {});
  return s.email;
}

// Encerra a sessão (logout): apaga a linha da sessão do cookie atual.
export async function destroySession(): Promise<void> {
  const tok = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (tok) await prisma.portalSession.deleteMany({ where: { sessionToken: tok } }).catch(() => {});
}
