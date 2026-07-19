import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal, effectiveSections } from "@/lib/notifications/client-portal";
import { getPortalUser, getPortalSessionEmail, isProtected } from "@/lib/portal-auth";

export const runtime = "nodejs";

// GET — quem está logado + seções que ELE pode ver (permissão por usuário) + se o
// cliente tem orçamento ligado (aba Orçamentos).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const email = await getPortalSessionEmail(portal.clientId);
  const [user, requireLogin, sections, ai, cp] = await Promise.all([
    getPortalUser(portal.clientId),
    isProtected(portal.clientId),
    effectiveSections(portal.clientId, email),
    prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { quotesEnabled: true } }),
    prisma.clientPortal.findUnique({ where: { clientId: portal.clientId }, select: { sections: true } }),
  ]);
  const aiTest = (cp?.sections ?? "").split(",").map((s) => s.trim()).includes("teste");
  return NextResponse.json({ user, requireLogin, sections, aiTest, quotesEnabled: ai?.quotesEnabled ?? false });
}
