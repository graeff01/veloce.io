import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getPortalUser, isProtected } from "@/lib/portal-auth";

export const runtime = "nodejs";

// GET — quem está logado neste portal (para o indicador de conta + views por papel).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const user = await getPortalUser(portal.clientId);
  return NextResponse.json({ user, requireLogin: await isProtected(portal.clientId) });
}
