import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { loginUser, createSession, parseDevice, PORTAL_COOKIE, sessionCookieOptions, normEmail } from "@/lib/portal-auth";
import { consume, LIMITS, clientIp } from "@/lib/ai-agent/security/quota";
import { emitSecurityEventAsync } from "@/lib/ai-agent/security/events";

export const runtime = "nodejs";

// POST { email, password } — valida a senha e cria a sessão (cookie longo).
//
// SEGURANÇA (achado A-03): o login do portal não tinha NENHUMA proteção contra força
// bruta — nem contador de falhas, nem limite por IP —, enquanto o login interno tinha.
// Agora há duas cotas independentes (identidade e IP), persistidas no banco para não
// zerarem a cada deploy nem afrouxarem com mais de uma instância.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const { email, password, device } = await req.json().catch(() => ({}));
  const e = normEmail(String(email || ""));
  const ip = clientIp(req);

  // Sessão de APARELHO (app nativo): o cliente se identifica mandando `device`.
  // Sem `device`, nada muda — o navegador continua recebendo só o cookie httpOnly.
  const dev = parseDevice(device);

  const [byId, byIp] = await Promise.all([
    consume("portal:login:id", `${portal.clientId}|${e}`, LIMITS.portalLoginPerIdentity.limit, LIMITS.portalLoginPerIdentity.windowMs),
    consume("portal:login:ip", ip, LIMITS.portalLoginPerIp.limit, LIMITS.portalLoginPerIp.windowMs),
  ]);
  if (!byId.allowed || !byIp.allowed) {
    emitSecurityEventAsync({
      clientId: portal.clientId, ring: "auth", control: "A-03", severity: "high", action: "blocked",
      labels: ["portal_login_bruteforce", byId.allowed ? "by_ip" : "by_identity"],
      evidence: `tentativas: id=${byId.count}/${byId.limit} ip=${byIp.count}/${byIp.limit}`, shadow: false,
    });
    const retry = Math.ceil(Math.max(byId.retryAfterMs, byIp.retryAfterMs) / 1000);
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  const r = await loginUser(portal.clientId, String(email || ""), String(password || ""));
  if (!r.ok || !r.email) {
    emitSecurityEventAsync({
      clientId: portal.clientId, ring: "auth", control: "A-03", severity: "low", action: "observed",
      labels: ["portal_login_fail"], evidence: `falha de login (${byId.count}ª na janela)`, shadow: false,
    });
    return NextResponse.json({ error: r.error }, { status: r.status ?? 401 });
  }

  const sess = await createSession(portal.clientId, r.email, dev);

  // App nativo: devolve o token no corpo e NÃO seta cookie. O token vai direto para o
  // Keychain do aparelho. Deliberadamente só acontece quando o cliente pede uma sessão
  // de aparelho — assim a resposta vista pelo navegador continua sendo `{ ok: true }`
  // e o segredo de sessão do PWA segue inacessível ao JavaScript (httpOnly preservado).
  if (dev) {
    const s = await prisma.portalSession.findUnique({ where: { sessionToken: sess }, select: { expiresAt: true } });
    return NextResponse.json({ ok: true, sessionToken: sess, expiresAt: s?.expiresAt ?? null });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, sess, sessionCookieOptions());
  return res;
}
