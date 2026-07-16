import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — Aprendizado da IA: correções que os vendedores registraram (a IA errou aqui).
// Pendentes primeiro; `pending` alimenta o badge. Base pra ajustar catálogo/frete/prompt.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }

  const rows = await prisma.aiCorrection.findMany({
    where: { clientId: portal.clientId },
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, kind: true, leadWanted: true, aiProposed: true, note: true, reviewerEmail: true, resolved: true, resolvedByEmail: true, createdAt: true, contactId: true },
  });
  const owners = await prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, select: { email: true, name: true } });
  const nameOf = new Map(owners.map((o) => [o.email, o.name || o.email]));

  const corrections = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    leadWanted: r.leadWanted,
    aiProposed: r.aiProposed,
    note: r.note,
    reviewer: r.reviewerEmail ? nameOf.get(r.reviewerEmail) ?? r.reviewerEmail : null,
    resolved: r.resolved,
    resolvedBy: r.resolvedByEmail ? nameOf.get(r.resolvedByEmail) ?? r.resolvedByEmail : null,
    createdAt: r.createdAt,
    contactId: r.contactId,
  }));
  const pending = corrections.filter((c) => !c.resolved).length;
  return NextResponse.json({ corrections, pending });
}
