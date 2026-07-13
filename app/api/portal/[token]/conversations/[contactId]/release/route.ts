import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { setHumanTakeover } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

// POST — a equipe DEVOLVE a conversa para a IA (limpa o takeover explícito).
// Mesmo escopo/auth do send: token→clientId + sessão quando o portal é protegido.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if (await isProtected(portal.clientId)) {
    const email = await getPortalSessionEmail(portal.clientId);
    if (!email) return NextResponse.json({ error: "Faça login para devolver a conversa." }, { status: 401 });
  }
  const r = await setHumanTakeover(portal.clientId, contactId, false);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, humanTakenOver: r.humanTakenOver });
}
