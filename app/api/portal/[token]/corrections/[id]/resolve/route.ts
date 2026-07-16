import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — marca a correção como ENSINADA (ajuste já feito no catálogo/frete/prompt).
// Body { resolved?: boolean } — default true; false reabre.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const me = await getPortalSessionEmail(portal.clientId);
  if (!me) return NextResponse.json({ error: "Faça login." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const resolved = body?.resolved !== false;

  const upd = await prisma.aiCorrection.updateMany({
    where: { id, clientId: portal.clientId },
    data: resolved ? { resolved: true, resolvedByEmail: me, resolvedAt: new Date() } : { resolved: false, resolvedByEmail: null, resolvedAt: null },
  });
  if (upd.count === 0) return NextResponse.json({ error: "Correção não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
