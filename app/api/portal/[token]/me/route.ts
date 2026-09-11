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
  const [user, requireLogin, sections, ai, cp, client] = await Promise.all([
    getPortalUser(portal.clientId),
    isProtected(portal.clientId),
    effectiveSections(portal.clientId, email),
    prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { quotesEnabled: true } }),
    prisma.clientPortal.findUnique({ where: { clientId: portal.clientId }, select: { sections: true } }),
    prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } }),
  ]);
  const aiTest = (cp?.sections ?? "").split(",").map((s) => s.trim()).includes("teste");
  // `brand` é ADITIVO: o PWA resolve marca no servidor (PortalShell/generateMetadata) e
  // ignora este campo. Existe para o app nativo, que é UM binário "Veloce" e precisa
  // vestir a marca do cliente em runtime — os dados já existiam, faltava a porta.
  return NextResponse.json({
    user, requireLogin, sections, aiTest, quotesEnabled: ai?.quotesEnabled ?? false,
    brand: {
      name: client?.name ?? null,
      logoUrl: client?.logoUrl ?? null,
      accentColor: portal.accentColor,
      mode: portal.mode,
    },
  });
}
