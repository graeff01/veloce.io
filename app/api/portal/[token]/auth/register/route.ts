import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { registerUser, createSession, PORTAL_COOKIE, sessionCookieOptions } from "@/lib/portal-auth";

export const runtime = "nodejs";

// POST { email, password, name? } — auto-cadastro pelo link fixo (limitado por maxUsers).
// Em caso de sucesso já cria a sessão (cookie) — o usuário entra direto.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const { email, password, name } = await req.json().catch(() => ({}));
  const r = await registerUser(portal.clientId, String(email || ""), String(password || ""), typeof name === "string" ? name : undefined);
  if (!r.ok || !r.email) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });

  const sess = await createSession(portal.clientId, r.email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, sess, sessionCookieOptions());
  return res;
}
