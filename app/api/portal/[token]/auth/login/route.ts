import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { loginUser, createSession, PORTAL_COOKIE, sessionCookieOptions } from "@/lib/portal-auth";

export const runtime = "nodejs";

// POST { email, password } — valida a senha e cria a sessão (cookie longo).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const { email, password } = await req.json().catch(() => ({}));
  const r = await loginUser(portal.clientId, String(email || ""), String(password || ""));
  if (!r.ok || !r.email) return NextResponse.json({ error: r.error }, { status: r.status ?? 401 });

  const sess = await createSession(portal.clientId, r.email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, sess, sessionCookieOptions());
  return res;
}
