// ── Gate ÚNICO de autorização do Portal do Cliente ────────────────────────────
// Correção do achado A-01 da auditoria: a autorização do portal era decidida rota a
// rota (40 pontos de decisão) e 11 rotas ficavam só com o token — servindo histórico
// completo, mídia, PDFs de orçamento e até AÇÕES (disparar a IA, mover o funil) sem
// exigir sessão, mesmo com `requireLogin` ligado no cliente.
//
// A partir daqui TODA rota de /api/portal/** passa por aqui. Adicionar rota nova sem
// o gate passa a ser um erro visível (tests/portal-guard.test.ts cobre a lista).
//
// Semântica preservada: cliente SEM `requireLogin` continua funcionando pelo link,
// exatamente como hoje. O gate só exige sessão de quem ativou login+senha.

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { resolvePortal, effectiveSections, SESSION_SCOPED, type PortalSection } from "@/lib/notifications/client-portal";
import { getPortalUser, isProtected, isAdminRole, isSomenteLeitura, bearerFromHeader } from "@/lib/portal-auth";
import { consume, LIMITS, clientIp } from "@/lib/ai-agent/security/quota";
import { emitSecurityEventAsync } from "@/lib/ai-agent/security/events";
import { securityMode } from "@/lib/ai-agent/security/policy";

export interface PortalIdentity {
  clientId: string;
  accentColor: string | null;
  mode: string;
  email: string | null;
  name: string | null;
  role: string | null;
  isAdmin: boolean;
  /** Gestor: acompanha tudo, não altera nada. Ver `isSomenteLeitura`. */
  somenteLeitura: boolean;
}

export type PortalGuardResult =
  | { ok: true; error: null; portal: PortalIdentity }
  | { ok: false; error: NextResponse; portal: null };

export interface PortalGuardOptions {
  /** Rota pública por natureza (login/registro/chave pública do push). Não exige sessão. */
  anonymous?: boolean;
  /** Seção do portal exigida (permissão por usuário). Ver PORTAL_SECTION_ENFORCE. */
  section?: PortalSection;
  /** Exige papel admin no painel do cliente. */
  requireAdmin?: boolean;
  /** Perfil de cota: llm (rotas que gastam modelo) | stream (SSE) | padrão. */
  cost?: "llm" | "stream" | "default";
  /** Desliga o rate limit (só para rotas de altíssima frequência já protegidas). */
  noRateLimit?: boolean;
  /**
   * Esta rota ESCREVE, mas um gestor pode usá-la mesmo assim.
   *
   * A regra é negar por padrão: rota de escrita nova nasce barrada para quem só
   * acompanha, e liberar exige dizer aqui — em vez de lembrar de barrar. São
   * poucas as exceções legítimas (entrar, sair, notificação do próprio aparelho,
   * pedir uma análise), e cada uma está anotada na sua rota.
   */
  permiteLeitor?: boolean;
}

const SECTION_ENFORCE = process.env.PORTAL_SECTION_ENFORCE === "1";

// Discriminante do rate limit. Web: prefixo do token do portal (comportamento atual).
// App: hash do token de sessão — o sentinela `_session` não distingue aparelhos, e o
// segredo em claro jamais deve ser persistido em RateBucket.key.
export function rateIdentity(token: string, req: Request): string {
  if (token !== SESSION_SCOPED) return token.slice(0, 24);
  const bearer = bearerFromHeader(req.headers.get("authorization"));
  if (!bearer) return SESSION_SCOPED; // sem credencial: balde comum, some no 404 adiante
  return `dev:${createHash("sha256").update(bearer).digest("base64url").slice(0, 20)}`;
}

const deny = (status: number, error: string): PortalGuardResult => ({
  ok: false, error: NextResponse.json({ error }, { status }), portal: null,
});

export async function guardPortal(
  req: Request,
  token: string,
  opts: PortalGuardOptions = {},
): Promise<PortalGuardResult> {
  // 1) Rate limit por token+IP — antes de tocar o banco de verdade.
  if (!opts.noRateLimit) {
    const limit = opts.cost === "llm" ? LIMITS.portalLlm : opts.cost === "stream" ? LIMITS.portalStream : LIMITS.portalRequests;
    // Com o sentinela do app (`_session`) o token é o MESMO para todo mundo: sem isto,
    // todos os aparelhos dividiriam um único balde e um cliente derrubaria os outros.
    // Discrimina-se pelo HASH do token de sessão — nunca pelo token em claro, que não
    // pode acabar gravado na tabela RateBucket.
    const key = `${rateIdentity(token, req)}|${clientIp(req)}`;
    const d = await consume(`portal:${opts.cost ?? "default"}`, key, limit.limit, limit.windowMs);
    if (!d.allowed) {
      emitSecurityEventAsync({
        clientId: "-", ring: "admission", control: "C-01", severity: "medium",
        action: securityMode() === "enforce" ? "blocked" : "observed",
        labels: ["portal_rate", opts.cost ?? "default", `count:${d.count}/${d.limit}`],
        evidence: `portal acima do teto (${d.count}/${d.limit})`, shadow: securityMode() !== "enforce",
      });
      if (securityMode() === "enforce") {
        return {
          ok: false, portal: null,
          error: NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, {
            status: 429, headers: { "Retry-After": String(Math.ceil(d.retryAfterMs / 1000)) },
          }),
        };
      }
    }
  }

  // 2) Token → cliente (só se o painel estiver ativo).
  const portal = await resolvePortal(token);
  if (!portal) return deny(404, "Link inválido");

  // 3) Sessão, quando o cliente ativou login+senha. As duas leituras são independentes —
  //    em paralelo para não somar latência ao caminho quente (polling de conversas).
  const [user, protectedPortal] = await Promise.all([
    getPortalUser(portal.clientId),
    isProtected(portal.clientId),
  ]);
  if (protectedPortal && !user && !opts.anonymous) {
    emitSecurityEventAsync({
      clientId: portal.clientId, ring: "auth", control: "A-01", severity: "medium",
      action: "blocked", labels: ["portal_no_session"], evidence: "acesso sem sessão em painel protegido", shadow: false,
    });
    return deny(401, "Faça login para acessar.");
  }

  const identity: PortalIdentity = {
    clientId: portal.clientId, accentColor: portal.accentColor, mode: portal.mode,
    email: user?.email ?? null, name: user?.name ?? null, role: user?.role ?? null,
    // O gestor enxerga como admin de propósito: ele acompanha a equipe inteira,
    // e o que o protege de mexer em algo é o bloqueio de escrita logo abaixo,
    // não a falta de visão.
    isAdmin: isAdminRole(user?.role) || isSomenteLeitura(user?.role),
    somenteLeitura: isSomenteLeitura(user?.role),
  };

  // 4) Papel admin do painel do cliente.
  if (opts.requireAdmin && !identity.isAdmin) return deny(403, "Ação restrita ao administrador do painel.");

  // 4.1) SOMENTE LEITURA. Vale desde já, sem modo observação: nenhum usuário
  //      existente tem este papel, então não há o que medir — quem o receber
  //      terá sido posto nele de propósito.
  const escreve = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  if (identity.somenteLeitura && escreve && !opts.permiteLeitor) {
    emitSecurityEventAsync({
      clientId: portal.clientId, ring: "auth", control: "A-05", severity: "low",
      action: "blocked", labels: ["portal_somente_leitura", req.method],
      evidence: `${identity.email} acompanha o painel e tentou ${req.method}`, shadow: false,
    });
    return deny(403, "Seu acesso é de acompanhamento: você vê as conversas, mas não responde nem altera.");
  }

  // 5) Permissão por SEÇÃO. Hoje `effectiveSections` só pinta o menu — a API não
  //    validava nada (achado A-04). Entra em modo observação: só bloqueia com
  //    PORTAL_SECTION_ENFORCE=1, depois de medir que nenhum usuário legítimo bate.
  if (opts.section && identity.email) {
    const allowed = await effectiveSections(portal.clientId, identity.email);
    if (!allowed.includes(opts.section)) {
      emitSecurityEventAsync({
        clientId: portal.clientId, ring: "auth", control: "A-04", severity: "medium",
        action: SECTION_ENFORCE ? "blocked" : "observed",
        labels: ["portal_section", opts.section], evidence: `${identity.email} sem a seção ${opts.section}`,
        shadow: !SECTION_ENFORCE,
      });
      if (SECTION_ENFORCE) return deny(403, "Você não tem acesso a esta área do painel.");
    }
  }

  return { ok: true, error: null, portal: identity };
}
