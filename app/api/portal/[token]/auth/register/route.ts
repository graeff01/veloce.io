import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { registerUser, createSession, PORTAL_COOKIE, sessionCookieOptions } from "@/lib/portal-auth";
import { consume, LIMITS, clientIp } from "@/lib/ai-agent/security/quota";
import { emitSecurityEventAsync } from "@/lib/ai-agent/security/events";

export const runtime = "nodejs";

// POST { email, password, name? } — auto-cadastro pelo link fixo (limitado por maxUsers).
// Em caso de sucesso já cria a sessão (cookie) — o usuário entra direto.
//
// SEGURANÇA (achado A-02): o auto-cadastro era ilimitado em taxa e o PRIMEIRO usuário
// virava admin do painel. A promoção automática saiu (ver registerUser) e aqui entra a
// cota por IP — cadastro em massa a partir de um link vazado deixa de ser gratuito.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const d = await consume("portal:register:ip", clientIp(req), LIMITS.portalRegisterPerIp.limit, LIMITS.portalRegisterPerIp.windowMs);
  if (!d.allowed) {
    emitSecurityEventAsync({
      clientId: portal.clientId, ring: "auth", control: "A-02", severity: "high", action: "blocked",
      labels: ["portal_register_flood", `count:${d.count}/${d.limit}`],
      evidence: "cadastros acima do teto por IP", shadow: false,
    });
    return NextResponse.json(
      { error: "Muitas tentativas de cadastro. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(d.retryAfterMs / 1000)) } },
    );
  }

  const { email, password, name } = await req.json().catch(() => ({}));
  const r = await registerUser(portal.clientId, String(email || ""), String(password || ""), typeof name === "string" ? name : undefined);
  if (!r.ok || !r.email) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });

  const sess = await createSession(portal.clientId, r.email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, sess, sessionCookieOptions());
  return res;
}
