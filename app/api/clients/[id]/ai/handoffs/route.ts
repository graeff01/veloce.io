import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

// Caixa de handoff (F2): leads quentes que a IA passou ao vendedor, com briefing.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // pending | claimed | done | (todos)
  const rows = await prisma.handoff.findMany({
    where: { clientId: id, ...(status ? { status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  // Enriquecemos com nome/telefone do contato para o vendedor.
  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const contacts = await prisma.waContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, displayName: true, waId: true } });
  const cmap = new Map(contacts.map((c) => [c.id, c]));

  return NextResponse.json(rows.map((r) => ({
    ...r,
    contact: cmap.get(r.contactId) ?? null,
  })));
}

const patchSchema = z.object({ handoffId: z.string(), status: z.enum(["pending", "claimed", "done"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  // Escopo por cliente (updateMany força o clientId no where — isolamento).
  const res = await prisma.handoff.updateMany({
    where: { id: parsed.data.handoffId, clientId: id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ updated: res.count });
}
