import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { normEmail, isAuthorized, recentOtpCount, createOtp, sendOtpEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";

// POST { email } — envia o código por e-mail se o e-mail estiver autorizado.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const { email } = await req.json().catch(() => ({}));
  const e = normEmail(email || "");
  if (!e || !e.includes("@")) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });

  if (!(await isAuthorized(portal.clientId, e)))
    return NextResponse.json({ error: "Esse e-mail não tem acesso a este painel. Fale com a sua agência." }, { status: 403 });

  if ((await recentOtpCount(portal.clientId, e)) >= 5)
    return NextResponse.json({ error: "Muitos pedidos. Tente novamente em 1 hora." }, { status: 429 });

  const code = await createOtp(portal.clientId, e);
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true } });
  const sent = await sendOtpEmail(e, code, client?.name || "Painel");
  if (!sent) return NextResponse.json({ error: "Envio de e-mail não configurado. Avise a sua agência." }, { status: 503 });

  return NextResponse.json({ ok: true });
}
