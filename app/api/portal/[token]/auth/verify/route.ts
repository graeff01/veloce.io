import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { normEmail, isAuthorized, verifyOtp, createSession, PORTAL_COOKIE, sessionCookieOptions } from "@/lib/portal-auth";

export const runtime = "nodejs";

// POST { email, code } — valida o código e cria a sessão (cookie longo).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const { email, code } = await req.json().catch(() => ({}));
  const e = normEmail(email || "");
  if (!(await isAuthorized(portal.clientId, e))) return NextResponse.json({ error: "E-mail não autorizado." }, { status: 403 });

  const ok = await verifyOtp(portal.clientId, e, String(code || ""));
  if (!ok) return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 401 });

  const sess = await createSession(portal.clientId, e);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, sess, sessionCookieOptions());
  return res;
}
