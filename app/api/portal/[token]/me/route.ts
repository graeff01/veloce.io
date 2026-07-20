import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal, effectiveSections } from "@/lib/notifications/client-portal";
import { getPortalUser, getPortalSessionEmail, isProtected } from "@/lib/portal-auth";

export const runtime = "nodejs";

// GET — quem está logado + seções habilitadas (para o indicador de conta + menu por cliente).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const email = await getPortalSessionEmail(portal.clientId);
  const [user, requireLogin, sections, ai] = await Promise.all([
    getPortalUser(portal.clientId),
    isProtected(portal.clientId),
    effectiveSections(portal.clientId, email),
    prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { quotesEnabled: true } }),
  ]);
  return NextResponse.json({ user, requireLogin, sections, quotesEnabled: ai?.quotesEnabled ?? false });
}
