import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

export interface PortalSession {
  credentialId: string;
  clientId: string;
  email: string;
  role: string;
  exp: number;
  iat: number;
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET não configurado");
  // namespace separado do staff para nunca misturar tokens
  return s + ":portal-v1";
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function createPortalToken(
  payload: Pick<PortalSession, "credentialId" | "clientId" | "email" | "role">
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: PortalSession = {
    ...payload,
    iat: now,
    exp: now + 30 * 24 * 60 * 60, // 30 dias
  };

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(full));
  const sig = createHmac("sha256", secret())
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${sig}`;
}

export function verifyPortalToken(token: string): PortalSession | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts as [string, string, string];
    const expected = createHmac("sha256", secret())
      .update(`${header}.${body}`)
      .digest("base64url");

    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(fromb64url(body)) as PortalSession;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
