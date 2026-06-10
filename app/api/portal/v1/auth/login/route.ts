import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createPortalToken } from "@/lib/portal-auth";
import { logPortalAccess } from "@/lib/portal-helpers";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Rate limit em memória — suficiente para o volume atual
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX = 5;

function isLocked(email: string): boolean {
  const a = attempts.get(email);
  if (!a) return false;
  if (Date.now() - a.firstAt > WINDOW_MS) { attempts.delete(email); return false; }
  return a.count >= MAX;
}

function recordAttempt(email: string): void {
  const a = attempts.get(email);
  if (!a || Date.now() - a.firstAt > WINDOW_MS) {
    attempts.set(email, { count: 1, firstAt: Date.now() });
  } else {
    a.count++;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Email e senha obrigatórios" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  if (isLocked(email)) {
    await logPortalAccess("unknown", null, "LOGIN_RATE_LIMITED", req);
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 5 minutos." },
      { status: 429 }
    );
  }

  const credential = await prisma.customerPortalCredential.findUnique({
    where: { email },
    include: {
      client: { select: { id: true, status: true, portalEnabled: true } },
    },
  });

  if (!credential || !credential.active) {
    recordAttempt(email);
    await logPortalAccess("unknown", null, "LOGIN_FAILED_NOT_FOUND", req);
    return NextResponse.json({ error: "Email ou senha inválidos" }, { status: 401 });
  }

  if (credential.client.status !== "ACTIVE" || !credential.client.portalEnabled) {
    recordAttempt(email);
    await logPortalAccess(credential.clientId, credential.id, "LOGIN_FAILED_PORTAL_DISABLED", req);
    return NextResponse.json({ error: "Acesso ao portal não habilitado" }, { status: 403 });
  }

  const valid = await verifyPassword(password, credential.passwordHash);
  if (!valid) {
    recordAttempt(email);
    await logPortalAccess(credential.clientId, credential.id, "LOGIN_FAILED_PASSWORD", req);
    return NextResponse.json({ error: "Email ou senha inválidos" }, { status: 401 });
  }

  // Login bem-sucedido
  attempts.delete(email);

  await Promise.all([
    logPortalAccess(credential.clientId, credential.id, "LOGIN_SUCCESS", req),
    prisma.customerPortalCredential.update({
      where: { id: credential.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  const token = createPortalToken({
    credentialId: credential.id,
    clientId: credential.clientId,
    email: credential.email,
    role: credential.role,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("portal-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return res;
}
