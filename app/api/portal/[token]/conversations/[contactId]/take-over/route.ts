import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { setHumanTakeover } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

// POST — a equipe PAUSA a IA (assume a conversa). Mesmo escopo/auth do send.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if (await isProtected(portal.clientId)) {
    const email = await getPortalSessionEmail(portal.clientId);
    if (!email) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const r = await setHumanTakeover(portal.clientId, contactId, true);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, humanTakenOver: r.humanTakenOver });
}
