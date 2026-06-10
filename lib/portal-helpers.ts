import { NextRequest, NextResponse } from "next/server";
import { verifyPortalToken, PortalSession } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

type AuthOk = { session: PortalSession; error: null };
type AuthFail = { session: null; error: NextResponse };

export async function requirePortalAuth(req: NextRequest): Promise<AuthOk | AuthFail> {
  const token = req.cookies.get("portal-token")?.value;

  if (!token) {
    return {
      session: null,
      error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }

  const session = verifyPortalToken(token);

  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Sessão inválida ou expirada" }, { status: 401 }),
    };
  }

  return { session, error: null };
}

export async function logPortalAccess(
  clientId: string,
  credentialId: string | null,
  action: string,
  req: NextRequest
): Promise<void> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;

  await prisma.portalAccessLog.create({
    data: { clientId, credentialId, action, ip, userAgent },
  });
}
