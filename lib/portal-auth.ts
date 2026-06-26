import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import crypto from "crypto";

export const PORTAL_COOKIE = "vp_session";
const SESSION_DAYS = 60;

export const normEmail = (e: string): string => (e || "").trim().toLowerCase();
const hashCode = (code: string): string => crypto.createHash("sha256").update(code).digest("hex");

// Cliente "protegido" = tem ao menos 1 e-mail autorizado. Sem e-mails = painel
// aberto pelo link (comportamento legado), então nada quebra até a agência cadastrar.
export async function isProtected(clientId: string): Promise<boolean> {
  return (await prisma.portalAccess.count({ where: { clientId } })) > 0;
}
export async function isAuthorized(clientId: string, email: string): Promise<boolean> {
  const a = await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId, email: normEmail(email) } } }).catch(() => null);
  return !!a;
}

export async function createOtp(clientId: string, email: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
  const e = normEmail(email);
  await prisma.portalOtp.deleteMany({ where: { clientId, email: e } }); // só um código ativo por vez
  await prisma.portalOtp.create({ data: { clientId, email: e, codeHash: hashCode(code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  return code;
}
export async function recentOtpCount(clientId: string, email: string): Promise<number> {
  return prisma.portalOtp.count({ where: { clientId, email: normEmail(email), createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
}
export async function verifyOtp(clientId: string, email: string, code: string): Promise<boolean> {
  const e = normEmail(email);
  const otp = await prisma.portalOtp.findFirst({ where: { clientId, email: e }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) return false;
  if (otp.codeHash !== hashCode((code || "").trim())) {
    await prisma.portalOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } }).catch(() => {});
    return false;
  }
  await prisma.portalOtp.deleteMany({ where: { clientId, email: e } });
  return true;
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

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendOtpEmail(to: string, code: string, clientName: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.PORTAL_EMAIL_FROM || "Veloce <painel@veloce.io>";
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [to], subject: `Seu código de acesso: ${code}`,
        html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:440px;margin:0 auto;padding:24px">
          <div style="font-size:18px;font-weight:800;margin:0 0 6px">Painel · ${escapeHtml(clientName)}</div>
          <p style="color:#555;font-size:14px;margin:0 0 18px">Use este código para acessar o painel de performance:</p>
          <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f4f5f7;border-radius:12px;padding:16px;text-align:center;color:#111">${code}</div>
          <p style="color:#888;font-size:12px;margin-top:18px">Expira em 10 minutos. Se você não pediu, ignore este e-mail.</p>
        </div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
