import { NextResponse } from "next/server";
import { guardPortal } from "@/lib/portal-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — marca a correção como ENSINADA (ajuste já feito no catálogo/frete/prompt).
// Body { resolved?: boolean } — default true; false reabre.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;
  const me = portal.email;
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
