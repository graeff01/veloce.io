import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { setAssignment } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

// POST { email } — define o DONO do lead (assumir=meu e-mail; transferir=outro; null=remover).
// Se "email" não vier, assume para o próprio usuário logado. Mesmo escopo/auth do send.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const me = await getPortalSessionEmail(portal.clientId);
  if (await isProtected(portal.clientId) && !me) return NextResponse.json({ error: "Faça login para assumir a conversa." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = "email" in (body || {}) ? (body.email === null ? null : String(body.email)) : me; // sem email → assume p/ mim
  const r = await setAssignment(portal.clientId, contactId, email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, assignedEmail: r.assignedEmail });
}
