import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { sendManualMessage } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

// POST — a equipe do cliente responde o lead com TEXTO LIVRE a partir do painel.
// Token-scoped: sendManualMessage confere que o contato é do próprio cliente (isolamento).
// Auth: quando o portal é protegido, exige sessão (agnóstico ao método de login — OTP hoje,
// login+senha depois). Persiste com aiGenerated=false → aciona o takeover (silencia o bot).
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const email = await getPortalSessionEmail(portal.clientId);
  if (await isProtected(portal.clientId) && !email) return NextResponse.json({ error: "Faça login para responder o lead." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const r = await sendManualMessage(portal.clientId, contactId, typeof body?.text === "string" ? body.text : "", email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, message: r.message });
}
